package source

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/escu-io/go-report-builder/internal/profile"
)

func TestBuildFileDetail_missingSource(t *testing.T) {
	dir := t.TempDir()
	resolver := Resolver{ModulePath: "example.com/m", RootDir: dir}

	detail, err := BuildFileDetail(resolver, "example.com/m/pkg/missing.go", nil)
	if err != nil {
		t.Fatalf("BuildFileDetail: %v", err)
	}
	if len(detail.Lines) != 0 {
		t.Fatalf("expected empty Lines for missing source, got %d", len(detail.Lines))
	}
}

func TestBuildFileDetail_withSource(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "file.go")
	if err := os.WriteFile(path, []byte("package p\n\nfunc f() {}\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	resolver := Resolver{ModulePath: "example.com/m", RootDir: dir}
	blocks := []profile.Block{
		{StartLine: 3, EndLine: 3, NumStmt: 1, Count: 1},
	}

	detail, err := BuildFileDetail(resolver, "example.com/m/file.go", blocks)
	if err != nil {
		t.Fatalf("BuildFileDetail: %v", err)
	}
	if len(detail.Lines) != 3 {
		t.Fatalf("expected 3 lines, got %d", len(detail.Lines))
	}
	if detail.Lines[2].Num != 3 {
		t.Fatalf("expected line 3, got %d", detail.Lines[2].Num)
	}
}
