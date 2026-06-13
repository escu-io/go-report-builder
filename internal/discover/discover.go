package discover

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// Options configures module file discovery.
type Options struct {
	RootDir    string
	ModulePath string
	Tags       []string
}

// Files returns file paths matching go cover profile format (import/path/file.go).
func Files(opts Options) ([]string, error) {
	root, err := filepath.Abs(opts.RootDir)
	if err != nil {
		return nil, err
	}

	modPath := opts.ModulePath
	if modPath == "" {
		modPath, err = modulePathFromDir(root)
		if err != nil {
			return nil, err
		}
	}

	var files []string
	err = filepath.WalkDir(root, func(path string, d os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if d.IsDir() {
			switch d.Name() {
			case "vendor", ".git":
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		if isGenerated(path) {
			return nil
		}

		rel, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		rel = filepath.ToSlash(rel)
		importPath := modPath + "/" + strings.TrimSuffix(rel, ".go")
		if rel == filepath.Base(rel) {
			importPath = modPath + "/" + strings.TrimSuffix(rel, ".go")
		}
		// Profile paths include .go suffix
		profilePath := modPath + "/" + rel
		if rel == "." {
			profilePath = modPath + "/" + filepath.Base(path)
		}
		files = append(files, profilePath)
		_ = importPath
		return nil
	})
	return files, err
}

func modulePathFromDir(dir string) (string, error) {
	modPath := filepath.Join(dir, "go.mod")
	f, err := os.Open(modPath)
	if err != nil {
		return "", fmt.Errorf("read go.mod: %w", err)
	}
	defer func() { _ = f.Close() }()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if strings.HasPrefix(line, "module ") {
			return strings.TrimSpace(strings.TrimPrefix(line, "module ")), nil
		}
	}
	return "", fmt.Errorf("module directive not found in go.mod")
}

func isGenerated(path string) bool {
	f, err := os.Open(path)
	if err != nil {
		return false
	}
	defer func() { _ = f.Close() }()
	sc := bufio.NewScanner(f)
	for i := 0; i < 3 && sc.Scan(); i++ {
		line := sc.Text()
		if strings.Contains(line, "Code generated") && strings.Contains(line, "DO NOT EDIT") {
			return true
		}
	}
	return false
}

// ResolveRoot finds the module root containing go.mod.
func ResolveRoot(start string) (string, string, error) {
	dir, err := filepath.Abs(start)
	if err != nil {
		return "", "", err
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			mod, err := modulePathFromDir(dir)
			return dir, mod, err
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", "", fmt.Errorf("go.mod not found from %s", start)
		}
		dir = parent
	}
}
