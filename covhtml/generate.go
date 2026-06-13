package covhtml

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/escu-io/go-report-builder/internal/discover"
	"github.com/escu-io/go-report-builder/internal/model"
	"github.com/escu-io/go-report-builder/internal/profile"
	"github.com/escu-io/go-report-builder/internal/render"
	"github.com/escu-io/go-report-builder/internal/source"
)

// ProfileInput is one Coverage Profile (a file produced by
// `go test -coverprofile`) to include in the report.
type ProfileInput struct {
	// Path is the filesystem path to the coverage profile.
	Path string
	// Label is the human-readable name shown for this run in the report.
	// When empty, the base name of Path is used.
	Label string
}

// Options configures report generation. The zero value is not valid:
// at least one entry in Profiles is required.
type Options struct {
	// Profiles is the set of coverage profiles to include. Required.
	Profiles []ProfileInput
	// OutputPath is where the HTML report is written.
	// Defaults to "coverage-report.html" when empty.
	OutputPath string
	// RootDir is the module root used to resolve and discover source files.
	// When empty, the root is auto-detected from the nearest go.mod.
	RootDir string
	// ProfileOnly restricts the report to files present in the profiles,
	// disabling whole-module discovery of untested files.
	ProfileOnly bool
	// BuildTags are additional build tags honored during file discovery.
	BuildTags []string
}

// Generate builds and writes the HTML coverage report.
func Generate(opts Options) error {
	if len(opts.Profiles) == 0 {
		return fmt.Errorf("at least one profile is required")
	}

	rootDir := opts.RootDir
	modulePath := ""
	var err error
	if rootDir == "" {
		rootDir, modulePath, err = discover.ResolveRoot(".")
		if err != nil {
			return err
		}
	} else {
		rootDir, err = filepath.Abs(rootDir)
		if err != nil {
			return err
		}
		modulePath, err = modulePathFromRoot(rootDir)
		if err != nil {
			return err
		}
	}
	opts.RootDir = rootDir

	runs, err := loadRuns(opts.Profiles)
	if err != nil {
		return err
	}

	var allFiles []string
	if !opts.ProfileOnly {
		allFiles, err = discover.Files(discover.Options{
			RootDir:    opts.RootDir,
			ModulePath: modulePath,
			Tags:       opts.BuildTags,
		})
		if err != nil {
			return err
		}
	}

	report := model.Build(model.BuildOptions{
		ModulePath:  modulePath,
		RootDir:     opts.RootDir,
		Runs:        runs,
		AllFiles:    allFiles,
		ProfileOnly: opts.ProfileOnly,
	})

	resolver := source.Resolver{ModulePath: modulePath, RootDir: opts.RootDir}
	if err := source.PopulateFileDetails(report, resolver); err != nil {
		return err
	}

	out := opts.OutputPath
	if out == "" {
		out = "coverage-report.html"
	}
	return render.WriteFile(out, report)
}

func loadRuns(profiles []ProfileInput) ([]model.Run, error) {
	runs := make([]model.Run, 0, len(profiles))
	for i, p := range profiles {
		f, err := os.Open(p.Path)
		if err != nil {
			return nil, fmt.Errorf("open profile %q: %w", p.Path, err)
		}
		prof, err := profile.Parse(f)
		_ = f.Close()
		if err != nil {
			return nil, fmt.Errorf("parse profile %q: %w", p.Path, err)
		}
		label := p.Label
		if label == "" {
			label = filepath.Base(p.Path)
		}
		id := fmt.Sprintf("run-%d", i)
		blocks := prof.Blocks
		runs = append(runs, model.Run{
			ID:     id,
			Label:  label,
			Blocks: blocks,
		})
	}
	return runs, nil
}

func modulePathFromRoot(root string) (string, error) {
	_, mod, err := discover.ResolveRoot(root)
	return mod, err
}
