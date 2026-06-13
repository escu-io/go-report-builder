package config

import (
	"os"
	"path/filepath"
	"testing"
)

func writeConfig(t *testing.T, contents string) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, DefaultPath)
	if err := os.WriteFile(path, []byte(contents), 0o644); err != nil {
		t.Fatalf("write config: %v", err)
	}
	return path
}

func TestLoadFull(t *testing.T) {
	path := writeConfig(t, `
output: out.html
root: /tmp/mod
profileOnly: true
buildTags:
  - integration
  - e2e
profiles:
  - path: unit.out
    label: unit
  - path: integration.out
    label: integration
`)

	f, err := Load(path, true)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if f.Output != "out.html" {
		t.Errorf("Output = %q, want out.html", f.Output)
	}
	if f.Root != "/tmp/mod" {
		t.Errorf("Root = %q, want /tmp/mod", f.Root)
	}
	if !f.ProfileOnly {
		t.Error("ProfileOnly = false, want true")
	}
	if len(f.BuildTags) != 2 || f.BuildTags[0] != "integration" || f.BuildTags[1] != "e2e" {
		t.Errorf("BuildTags = %v, want [integration e2e]", f.BuildTags)
	}
	if len(f.Profiles) != 2 {
		t.Fatalf("Profiles = %d, want 2", len(f.Profiles))
	}
	if f.Profiles[0] != (Profile{Path: "unit.out", Label: "unit"}) {
		t.Errorf("Profiles[0] = %+v", f.Profiles[0])
	}
}

func TestLoadShorthandProfiles(t *testing.T) {
	path := writeConfig(t, `
profiles:
  - unit.out
  - path: integration.out
    label: integration
`)

	f, err := Load(path, true)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if len(f.Profiles) != 2 {
		t.Fatalf("Profiles = %d, want 2", len(f.Profiles))
	}
	if f.Profiles[0] != (Profile{Path: "unit.out"}) {
		t.Errorf("shorthand Profiles[0] = %+v, want {Path: unit.out}", f.Profiles[0])
	}
	if f.Profiles[1] != (Profile{Path: "integration.out", Label: "integration"}) {
		t.Errorf("Profiles[1] = %+v", f.Profiles[1])
	}
}

func TestLoadMissingDefaultIsEmpty(t *testing.T) {
	path := filepath.Join(t.TempDir(), DefaultPath)
	f, err := Load(path, false)
	if err != nil {
		t.Fatalf("Load missing (non-explicit): %v", err)
	}
	if f == nil || len(f.Profiles) != 0 || f.Output != "" {
		t.Errorf("expected empty config, got %+v", f)
	}
}

func TestLoadMissingExplicitErrors(t *testing.T) {
	path := filepath.Join(t.TempDir(), DefaultPath)
	if _, err := Load(path, true); err == nil {
		t.Fatal("expected error for missing explicit config file")
	}
}

func TestLoadEmptyFile(t *testing.T) {
	path := writeConfig(t, "")
	f, err := Load(path, true)
	if err != nil {
		t.Fatalf("Load empty: %v", err)
	}
	if len(f.Profiles) != 0 {
		t.Errorf("expected no profiles, got %d", len(f.Profiles))
	}
}

func TestLoadUnknownFieldErrors(t *testing.T) {
	path := writeConfig(t, "outputt: typo.html\n")
	if _, err := Load(path, true); err == nil {
		t.Fatal("expected error for unknown field")
	}
}
