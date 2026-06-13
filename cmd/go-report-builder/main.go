package main

import (
	"flag"
	"fmt"
	"os"
	"strings"

	"github.com/escu-io/go-report-builder/covhtml"
)

func main() {
	var (
		output      = flag.String("o", "coverage-report.html", "output HTML file path")
		root        = flag.String("root", "", "module root directory (default: auto-detect from go.mod)")
		profileOnly = flag.Bool("profile-only", false, "only include files present in profiles")
		runNames    = flag.String("run-names", "", "comma-separated labels for profiles (same order as positional args)")
	)
	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, "Usage: go-report-builder [flags] profile.out [profile2.out ...]\n\n")
		fmt.Fprintf(os.Stderr, "Generate an interactive HTML coverage report from go test -coverprofile files.\n\n")
		flag.PrintDefaults()
	}
	flag.Parse()

	args := flag.Args()
	if len(args) == 0 {
		flag.Usage()
		os.Exit(2)
	}

	var names []string
	if *runNames != "" {
		names = strings.Split(*runNames, ",")
	}

	profiles := make([]covhtml.ProfileInput, len(args))
	for i, path := range args {
		label := ""
		if i < len(names) {
			label = strings.TrimSpace(names[i])
		}
		profiles[i] = covhtml.ProfileInput{Path: path, Label: label}
	}

	err := covhtml.Generate(covhtml.Options{
		Profiles:    profiles,
		OutputPath:  *output,
		RootDir:     *root,
		ProfileOnly: *profileOnly,
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "go-report-builder: %v\n", err)
		os.Exit(1)
	}
}
