// Package config loads the optional .go-coverage-report.yaml file that
// configures the CLI. Every field mirrors a covhtml.Options field (and the
// equivalent command-line flag), so the file and the flags are interchangeable.
//
// The YAML parser is intentionally confined to this internal package: the
// public covhtml library stays free of third-party dependencies.
package config

import (
	"errors"
	"fmt"
	"io"
	"os"
	"strings"

	"gopkg.in/yaml.v3"
)

// DefaultPath is the config file looked up in the working directory when the
// user does not pass an explicit -config flag.
const DefaultPath = ".go-coverage-report.yaml"

// Profile is one coverage profile entry in the config file. In YAML it may be
// written either as a bare string (the path) or as a mapping with an optional
// label:
//
//	profiles:
//	  - unit.out                       # shorthand: path only
//	  - path: integration.out          # full form with a label
//	    label: integration
type Profile struct {
	Path  string `yaml:"path"`
	Label string `yaml:"label"`
}

// UnmarshalYAML accepts either a scalar (treated as Path) or a mapping.
func (p *Profile) UnmarshalYAML(value *yaml.Node) error {
	if value.Kind == yaml.ScalarNode {
		return value.Decode(&p.Path)
	}
	type rawProfile Profile
	var raw rawProfile
	if err := value.Decode(&raw); err != nil {
		return err
	}
	*p = Profile(raw)
	return nil
}

// File is the parsed .go-coverage-report.yaml. Every field is optional; the
// zero value means "not configured" and lets CLI flags or built-in defaults
// take over.
type File struct {
	// Output is the HTML output path (CLI: -o).
	Output string `yaml:"output"`
	// Root is the module root directory (CLI: -root).
	Root string `yaml:"root"`
	// ProfileOnly restricts the report to files present in the profiles (CLI: -profile-only).
	ProfileOnly bool `yaml:"profileOnly"`
	// BuildTags are additional build tags honored during discovery (CLI: -tags).
	BuildTags []string `yaml:"buildTags"`
	// Profiles are the coverage profiles to include (CLI: positional args + -run-names).
	Profiles []Profile `yaml:"profiles"`
}

// Load reads and parses the config file at path.
//
// When explicit is false (the default path was used) a missing file is not an
// error: an empty *File is returned so the caller falls back to flags/defaults.
// When explicit is true (the user passed -config) a missing file is an error.
func Load(path string, explicit bool) (*File, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) && !explicit {
			return &File{}, nil
		}
		return nil, fmt.Errorf("read config %q: %w", path, err)
	}

	var f File
	dec := yaml.NewDecoder(strings.NewReader(string(data)))
	dec.KnownFields(true)
	if err := dec.Decode(&f); err != nil {
		if errors.Is(err, io.EOF) {
			return &File{}, nil
		}
		return nil, fmt.Errorf("parse config %q: %w", path, err)
	}
	return &f, nil
}
