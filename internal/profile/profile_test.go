package profile

import (
	"strings"
	"testing"
)

func TestParse(t *testing.T) {
	input := `mode: set
example.com/foo/bar.go:10.4,12.40 3 1
example.com/foo/bar.go:14.2,16.1 2 0
`
	p, err := Parse(strings.NewReader(input))
	if err != nil {
		t.Fatal(err)
	}
	if p.Mode != ModeSet {
		t.Fatalf("mode = %q, want set", p.Mode)
	}
	if len(p.Blocks) != 2 {
		t.Fatalf("blocks = %d, want 2", len(p.Blocks))
	}
	b := p.Blocks[0]
	if b.File != "example.com/foo/bar.go" || b.StartLine != 10 || b.EndLine != 12 || b.NumStmt != 3 || b.Count != 1 {
		t.Fatalf("unexpected first block: %+v", b)
	}
}

func TestParseMissingMode(t *testing.T) {
	_, err := Parse(strings.NewReader("example.com/a.go:1.1,2.1 1 0\n"))
	if err == nil {
		t.Fatal("expected error for missing mode")
	}
}
