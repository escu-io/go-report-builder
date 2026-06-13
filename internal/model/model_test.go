package model

import (
	"testing"

	"github.com/escu-io/go-report-builder/internal/profile"
)

func TestBuildMergedUnion(t *testing.T) {
	runs := []Run{
		{
			ID:    "a",
			Label: "run-a",
			Blocks: []profile.Block{
				{File: "mod/pkg/a.go", StartLine: 1, StartCol: 1, EndLine: 1, EndCol: 10, NumStmt: 2, Count: 1},
			},
		},
		{
			ID:    "b",
			Label: "run-b",
			Blocks: []profile.Block{
				{File: "mod/pkg/a.go", StartLine: 2, StartCol: 1, EndLine: 2, EndCol: 10, NumStmt: 3, Count: 1},
			},
		},
	}

	report := Build(BuildOptions{
		ModulePath:  "mod",
		Runs:        runs,
		AllFiles:    []string{"mod/pkg/a.go"},
		ProfileOnly: false,
	})

	fc := report.Files["mod/pkg/a.go"]
	if fc.TotalStmts != 5 {
		t.Fatalf("total stmts = %d, want 5", fc.TotalStmts)
	}
	if fc.CoveredStmts != 5 {
		t.Fatalf("covered stmts = %d, want 5", fc.CoveredStmts)
	}
	if !fc.RunCoverage["a"] || !fc.RunCoverage["b"] {
		t.Fatalf("expected both runs to cover file: %+v", fc.RunCoverage)
	}
}

func TestDeriveLineStates(t *testing.T) {
	blocks := []profile.Block{
		{StartLine: 1, EndLine: 1, Count: 1},
		{StartLine: 2, EndLine: 2, Count: 0},
		{StartLine: 3, EndLine: 3, Count: 1},
		{StartLine: 3, EndLine: 3, Count: 0},
	}
	states := DeriveLineStates(blocks, 4)
	if states[1] != LineCovered {
		t.Fatalf("line 1 = %q", states[1])
	}
	if states[2] != LineUncovered {
		t.Fatalf("line 2 = %q", states[2])
	}
	if states[3] != LinePartial {
		t.Fatalf("line 3 = %q", states[3])
	}
	if states[4] != LineNotTracked {
		t.Fatalf("line 4 = %q", states[4])
	}
}

func TestProfileOnlyExcludesUndiscovered(t *testing.T) {
	runs := []Run{
		{
			ID: "a",
			Blocks: []profile.Block{
				{File: "mod/a.go", StartLine: 1, StartCol: 1, EndLine: 1, EndCol: 5, NumStmt: 1, Count: 1},
			},
		},
	}
	report := Build(BuildOptions{
		ModulePath:  "mod",
		Runs:        runs,
		AllFiles:    []string{"mod/a.go", "mod/b.go"},
		ProfileOnly: true,
	})
	if _, ok := report.Files["mod/b.go"]; ok {
		t.Fatal("profile-only should not include undiscovered file")
	}
}
