package model

import (
	"path"
	"sort"
	"strings"

	"github.com/escu-io/go-report-builder/internal/profile"
)

type LineState string

const (
	LineCovered    LineState = "covered"
	LinePartial    LineState = "partial"
	LineUncovered  LineState = "uncovered"
	LineNotTracked LineState = "not-tracked"
)

// Run is one input Coverage Profile with a label.
type Run struct {
	ID     string
	Label  string
	Blocks []profile.Block
}

// FileCoverage holds statement-based coverage for one file.
type FileCoverage struct {
	ImportPath      string
	RelPath         string
	TotalStmts      int
	CoveredStmts    int
	Percent         float64
	Blocks          []profile.Block
	LineStates      map[int]LineState
	RunCoverage     map[string]bool
	MergedBlockHits map[blockKey]bool
	PerRunBlockHits map[string]map[blockKey]bool
}

type blockKey struct {
	startLine int
	startCol  int
	endLine   int
	endCol    int
}

// Report is the full coverage model for rendering.
type Report struct {
	ModulePath   string
	RootDir      string
	OverallPct   float64
	TotalStmts   int
	CoveredStmts int
	Runs         []RunInfo
	Tree         *TreeNode
	Files        map[string]*FileCoverage
	FileDetails  map[string]*FileDetail
}

type RunInfo struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

// TreeNode is a directory or file in the hierarchy.
type TreeNode struct {
	Name     string      `json:"name"`
	Path     string      `json:"path"`
	IsDir    bool        `json:"isDir"`
	Total    int         `json:"total"`
	Covered  int         `json:"covered"`
	Percent  float64     `json:"percent"`
	Children []*TreeNode `json:"children"`
}

// FileDetail is highlighted source for the file detail view.
type FileDetail struct {
	ImportPath string       `json:"importPath"`
	RelPath    string       `json:"relPath"`
	Lines      []DetailLine `json:"lines"`
}

type DetailLine struct {
	Num   int       `json:"num"`
	State LineState `json:"state"`
	HTML  string    `json:"html"`
}

// BuildOptions configures model construction.
type BuildOptions struct {
	ModulePath  string
	RootDir     string
	Runs        []Run
	AllFiles    []string // import paths discovered or from profiles
	ProfileOnly bool
}

// Build constructs the coverage report model.
func Build(opts BuildOptions) *Report {
	runBlockHits := make([]map[blockKey]profile.Block, len(opts.Runs))
	for i, run := range opts.Runs {
		m := make(map[blockKey]profile.Block)
		for _, b := range run.Blocks {
			k := blockKey{b.StartLine, b.StartCol, b.EndLine, b.EndCol}
			if existing, ok := m[k]; ok {
				if b.Count > existing.Count {
					m[k] = b
				}
			} else {
				m[k] = b
			}
		}
		runBlockHits[i] = m
	}

	fileSet := make(map[string]struct{})
	if opts.ProfileOnly {
		for _, run := range opts.Runs {
			for _, b := range run.Blocks {
				fileSet[b.File] = struct{}{}
			}
		}
	} else {
		for _, f := range opts.AllFiles {
			fileSet[f] = struct{}{}
		}
		for _, run := range opts.Runs {
			for _, b := range run.Blocks {
				fileSet[b.File] = struct{}{}
			}
		}
	}

	files := make(map[string]*FileCoverage, len(fileSet))
	for importPath := range fileSet {
		fc := &FileCoverage{
			ImportPath:      importPath,
			LineStates:      make(map[int]LineState),
			RunCoverage:     make(map[string]bool),
			MergedBlockHits: make(map[blockKey]bool),
			PerRunBlockHits: make(map[string]map[blockKey]bool),
		}
		for _, run := range opts.Runs {
			fc.PerRunBlockHits[run.ID] = make(map[blockKey]bool)
		}
		files[importPath] = fc
	}

	// Collect blocks per file from merged view (union).
	mergedBlocks := make(map[string]map[blockKey]profile.Block)
	for i, run := range opts.Runs {
		for k, b := range runBlockHits[i] {
			if _, ok := files[b.File]; !ok {
				continue
			}
			if mergedBlocks[b.File] == nil {
				mergedBlocks[b.File] = make(map[blockKey]profile.Block)
			}
			existing := mergedBlocks[b.File][k]
			existing.File = b.File
			existing.StartLine = b.StartLine
			existing.StartCol = b.StartCol
			existing.EndLine = b.EndLine
			existing.EndCol = b.EndCol
			existing.NumStmt = b.NumStmt
			if b.Count > 0 {
				existing.Count = 1
			}
			if existing.NumStmt == 0 {
				existing.NumStmt = b.NumStmt
			}
			mergedBlocks[b.File][k] = existing

			fc := files[b.File]
			if b.Count > 0 {
				fc.RunCoverage[run.ID] = true
				fc.PerRunBlockHits[run.ID][k] = true
				fc.MergedBlockHits[k] = true
			}
		}
	}

	var totalStmts, coveredStmts int
	for importPath, fc := range files {
		blocks := mergedBlocks[importPath]
		blockList := make([]profile.Block, 0, len(blocks))
		for _, b := range blocks {
			blockList = append(blockList, b)
			fc.TotalStmts += b.NumStmt
			if b.Count > 0 {
				fc.CoveredStmts += b.NumStmt
			}
		}
		sort.Slice(blockList, func(i, j int) bool {
			if blockList[i].StartLine != blockList[j].StartLine {
				return blockList[i].StartLine < blockList[j].StartLine
			}
			return blockList[i].StartCol < blockList[j].StartCol
		})
		fc.Blocks = blockList
		if fc.TotalStmts > 0 {
			fc.Percent = float64(fc.CoveredStmts) / float64(fc.TotalStmts) * 100
		}
		totalStmts += fc.TotalStmts
		coveredStmts += fc.CoveredStmts
	}

	overall := 0.0
	if totalStmts > 0 {
		overall = float64(coveredStmts) / float64(totalStmts) * 100
	}

	runInfos := make([]RunInfo, len(opts.Runs))
	for i, r := range opts.Runs {
		runInfos[i] = RunInfo{ID: r.ID, Label: r.Label}
	}

	// Derive rel paths from import paths.
	for importPath, fc := range files {
		fc.RelPath = importToRel(opts.ModulePath, importPath)
	}

	tree := buildTree(opts.ModulePath, files)

	return &Report{
		ModulePath:   opts.ModulePath,
		RootDir:      opts.RootDir,
		OverallPct:   overall,
		TotalStmts:   totalStmts,
		CoveredStmts: coveredStmts,
		Runs:         runInfos,
		Tree:         tree,
		Files:        files,
		FileDetails:  make(map[string]*FileDetail),
	}
}

func importToRel(modulePath, importPath string) string {
	if modulePath != "" && strings.HasPrefix(importPath, modulePath) {
		rel := strings.TrimPrefix(importPath, modulePath)
		rel = strings.TrimPrefix(rel, "/")
		if rel == "" {
			return "."
		}
		return rel
	}
	return importPath
}

func buildTree(modulePath string, files map[string]*FileCoverage) *TreeNode {
	root := &TreeNode{Name: modulePath, Path: "", IsDir: true}
	if modulePath == "" {
		root.Name = "."
	}

	type dirNode struct {
		node *TreeNode
	}
	dirs := map[string]*dirNode{"": {node: root}}

	paths := make([]string, 0, len(files))
	for p := range files {
		paths = append(paths, p)
	}
	sort.Strings(paths)

	for _, importPath := range paths {
		fc := files[importPath]
		rel := fc.RelPath
		parts := strings.Split(rel, "/")
		if rel == "." {
			parts = []string{path.Base(importPath)}
		}

		parentPath := ""
		for i, part := range parts {
			isDir := i < len(parts)-1
			currentPath := part
			if parentPath != "" {
				currentPath = parentPath + "/" + part
			}

			if isDir {
				if _, ok := dirs[currentPath]; !ok {
					parent := dirs[parentPath].node
					n := &TreeNode{Name: part, Path: currentPath, IsDir: true}
					parent.Children = append(parent.Children, n)
					dirs[currentPath] = &dirNode{node: n}
				}
				parentPath = currentPath
			} else {
				parent := dirs[parentPath].node
				n := &TreeNode{
					Name:    part,
					Path:    importPath,
					IsDir:   false,
					Total:   fc.TotalStmts,
					Covered: fc.CoveredStmts,
					Percent: fc.Percent,
				}
				parent.Children = append(parent.Children, n)
			}
		}
	}

	aggregate(root)
	sortTree(root)
	return root
}

func aggregate(n *TreeNode) {
	if !n.IsDir {
		return
	}
	for _, c := range n.Children {
		aggregate(c)
		if c.IsDir {
			n.Total += c.Total
			n.Covered += c.Covered
		} else {
			n.Total += c.Total
			n.Covered += c.Covered
		}
	}
	if n.Total > 0 {
		n.Percent = float64(n.Covered) / float64(n.Total) * 100
	}
	sort.Slice(n.Children, func(i, j int) bool {
		if n.Children[i].IsDir != n.Children[j].IsDir {
			return n.Children[i].IsDir
		}
		return n.Children[i].Name < n.Children[j].Name
	})
}

func sortTree(n *TreeNode) {
	for _, c := range n.Children {
		sortTree(c)
	}
}

// DeriveLineStates computes line states from blocks for a file.
func DeriveLineStates(blocks []profile.Block, maxLine int) map[int]LineState {
	states := make(map[int]LineState)
	lineBlocks := make(map[int][]profile.Block)

	for _, b := range blocks {
		for line := b.StartLine; line <= b.EndLine; line++ {
			lineBlocks[line] = append(lineBlocks[line], b)
		}
	}

	for line := 1; line <= maxLine; line++ {
		bs := lineBlocks[line]
		if len(bs) == 0 {
			states[line] = LineNotTracked
			continue
		}
		hit, miss := 0, 0
		for _, b := range bs {
			if b.Count > 0 {
				hit++
			} else {
				miss++
			}
		}
		switch {
		case hit > 0 && miss == 0:
			states[line] = LineCovered
		case hit > 0 && miss > 0:
			states[line] = LinePartial
		default:
			states[line] = LineUncovered
		}
	}
	return states
}
