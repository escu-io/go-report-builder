package main

import (
	"flag"
	"fmt"
	"os"
	"strings"

	"github.com/escu-io/go-report-builder/covhtml"
	"github.com/escu-io/go-report-builder/internal/config"
)

// version is set at build time via -ldflags (see .goreleaser.yaml).
var version = "dev"

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintf(os.Stderr, "go-report-builder: %v\n", err)
		os.Exit(1)
	}
}

func run(argv []string) error {
	if len(argv) == 1 && (argv[0] == "-version" || argv[0] == "--version") {
		fmt.Println(version)
		return nil
	}

	fs := flag.NewFlagSet("go-report-builder", flag.ExitOnError)
	var (
		showVersion = fs.Bool("version", false, "print version and exit")
		configPath  = fs.String("config", config.DefaultPath, "path to YAML config file (optional)")
		output      = fs.String("o", "coverage-report.html", "output HTML file path")
		root        = fs.String("root", "", "module root directory (default: auto-detect from go.mod)")
		profileOnly = fs.Bool("profile-only", false, "only include files present in profiles")
		tags        = fs.String("tags", "", "comma-separated build tags honored during discovery")
		runNames    = fs.String("run-names", "", "comma-separated labels for profiles (same order as positional args)")
	)
	fs.Usage = func() {
		fmt.Fprintf(os.Stderr, "Usage: go-report-builder [flags] [profile.out ...]\n\n")
		fmt.Fprintf(os.Stderr, "Generate an interactive HTML coverage report from go test -coverprofile files.\n\n")
		fmt.Fprintf(os.Stderr, "Options may also be set in a %s file; flags and positional args override it.\n\n", config.DefaultPath)
		fs.PrintDefaults()
	}
	if err := fs.Parse(argv); err != nil {
		return err
	}

	if *showVersion {
		fmt.Println(version)
		return nil
	}

	set := map[string]bool{}
	fs.Visit(func(f *flag.Flag) { set[f.Name] = true })

	cfg, err := config.Load(*configPath, set["config"])
	if err != nil {
		return err
	}

	opts := covhtml.Options{
		Profiles:    profilesFromConfig(cfg.Profiles),
		OutputPath:  cfg.Output,
		RootDir:     cfg.Root,
		ProfileOnly: cfg.ProfileOnly,
		BuildTags:   cfg.BuildTags,
	}

	// Flags explicitly passed on the command line override the config file.
	if set["o"] {
		opts.OutputPath = *output
	}
	if set["root"] {
		opts.RootDir = *root
	}
	if set["profile-only"] {
		opts.ProfileOnly = *profileOnly
	}
	if set["tags"] {
		opts.BuildTags = splitList(*tags)
	}

	// Positional profile arguments replace the config file's profiles entirely.
	if args := fs.Args(); len(args) > 0 {
		opts.Profiles = profilesFromArgs(args, splitList(*runNames))
	}

	if len(opts.Profiles) == 0 {
		fs.Usage()
		os.Exit(2)
	}

	return covhtml.Generate(opts)
}

func profilesFromConfig(in []config.Profile) []covhtml.ProfileInput {
	if len(in) == 0 {
		return nil
	}
	out := make([]covhtml.ProfileInput, len(in))
	for i, p := range in {
		out[i] = covhtml.ProfileInput{Path: p.Path, Label: p.Label}
	}
	return out
}

func profilesFromArgs(paths, names []string) []covhtml.ProfileInput {
	out := make([]covhtml.ProfileInput, len(paths))
	for i, path := range paths {
		label := ""
		if i < len(names) {
			label = names[i]
		}
		out[i] = covhtml.ProfileInput{Path: path, Label: label}
	}
	return out
}

func splitList(s string) []string {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}
