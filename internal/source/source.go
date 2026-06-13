package source

import (
	"bufio"
	"fmt"
	"go/scanner"
	"go/token"
	"os"
	"path/filepath"
	"strings"

	"github.com/escu-io/go-report-builder/internal/model"
	"github.com/escu-io/go-report-builder/internal/profile"
)

// Resolver maps import paths to filesystem paths.
type Resolver struct {
	ModulePath string
	RootDir    string
}

// PathForImport returns the filesystem path for a profile file path.
func (r Resolver) PathForImport(profilePath string) string {
	rel := profilePath
	if r.ModulePath != "" && strings.HasPrefix(profilePath, r.ModulePath) {
		rel = strings.TrimPrefix(profilePath, r.ModulePath)
		rel = strings.TrimPrefix(rel, "/")
	}
	if rel == "" {
		return filepath.Join(r.RootDir, filepath.Base(profilePath))
	}
	return filepath.Join(r.RootDir, filepath.FromSlash(rel))
}

// ReadLines reads source file lines; returns empty if missing.
func ReadLines(path string) ([]string, error) {
	f, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	defer func() { _ = f.Close() }()
	var lines []string
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		lines = append(lines, sc.Text())
	}
	return lines, sc.Err()
}

// HighlightLine tokenizes one Go source line for HTML display.
func HighlightLine(line string) string {
	var sb strings.Builder
	var s scanner.Scanner
	fset := token.NewFileSet()
	file := fset.AddFile("", fset.Base(), len(line))
	s.Init(file, []byte(line), nil, scanner.ScanComments)
	// last tracks the offset up to which we have emitted source text, so that
	// whitespace and other inter-token characters are preserved verbatim.
	last := 0
	for {
		pos, tok, lit := s.Scan()
		if tok == token.EOF {
			break
		}
		start := fset.Position(pos).Offset
		if start > len(line) {
			start = len(line)
		}
		// Emit any skipped text (indentation, spaces between tokens) untouched.
		if start > last {
			sb.WriteString(htmlEscape(line[last:start]))
			last = start
		}
		// Operators and delimiters report an empty literal; recover their text
		// from the token itself so parentheses, braces, etc. are not dropped.
		text := lit
		if text == "" {
			text = tok.String()
		}
		end := start + len(text)
		if end > len(line) {
			end = len(line)
		}
		if end <= start {
			// Nothing in the source maps to this token (e.g. an
			// automatically inserted semicolon at end of line).
			continue
		}
		segment := htmlEscape(line[start:end])
		if class := tokenClass(tok); class != "" {
			sb.WriteString(`<span class="`)
			sb.WriteString(class)
			sb.WriteString(`">`)
			sb.WriteString(segment)
			sb.WriteString("</span>")
		} else {
			sb.WriteString(segment)
		}
		last = end
	}
	// Emit any trailing text the scanner did not cover.
	if last < len(line) {
		sb.WriteString(htmlEscape(line[last:]))
	}
	if sb.Len() == 0 {
		return htmlEscape(line)
	}
	return sb.String()
}

func tokenClass(tok token.Token) string {
	switch {
	case tok == token.COMMENT:
		return "cmt"
	case tok == token.STRING || tok == token.CHAR:
		return "str"
	case tok == token.IDENT:
		return "ident"
	case tok.IsLiteral():
		return "lit"
	case tok.IsKeyword():
		return "kw"
	default:
		return "op"
	}
}

func htmlEscape(s string) string {
	replacer := strings.NewReplacer(
		"&", "&amp;",
		"<", "&lt;",
		">", "&gt;",
		`"`, "&quot;",
	)
	return replacer.Replace(s)
}

// BuildFileDetail creates highlighted source with line states.
func BuildFileDetail(resolver Resolver, importPath string, blocks []profile.Block) (*model.FileDetail, error) {
	path := resolver.PathForImport(importPath)
	lines, err := ReadLines(path)
	if err != nil {
		return nil, err
	}
	maxLine := len(lines)
	states := model.DeriveLineStates(blocks, maxLine)

	detail := &model.FileDetail{
		ImportPath: importPath,
		RelPath:    strings.TrimPrefix(strings.TrimPrefix(importPath, resolver.ModulePath), "/"),
		Lines:      make([]model.DetailLine, 0, maxLine),
	}

	if len(lines) == 0 {
		// Leave Lines empty so the UI can show a proper empty state instead of a
		// fake source row with line-number gutter artifacts.
		return detail, nil
	}

	for i, line := range lines {
		num := i + 1
		state := states[num]
		if state == "" {
			state = model.LineNotTracked
		}
		detail.Lines = append(detail.Lines, model.DetailLine{
			Num:   num,
			State: state,
			HTML:  HighlightLine(line),
		})
	}
	return detail, nil
}

// PopulateFileDetails fills report file details.
func PopulateFileDetails(report *model.Report, resolver Resolver) error {
	for importPath, fc := range report.Files {
		detail, err := BuildFileDetail(resolver, importPath, fc.Blocks)
		if err != nil {
			return fmt.Errorf("%s: %w", importPath, err)
		}
		fc.LineStates = model.DeriveLineStates(fc.Blocks, len(detail.Lines))
		report.FileDetails[importPath] = detail
	}
	return nil
}
