// Package covhtml turns standard Go coverage profiles (the files produced by
// `go test -coverprofile`) into a single, self-contained, interactive HTML
// coverage report.
//
// The report bundles its own CSS and JavaScript, so the generated file can be
// opened directly in a browser or published as a static artifact with no
// runtime dependencies. It provides a zoomable treemap, a collapsible
// package/file tree, syntax-highlighted file detail with per-line states, a
// per-run filter, and a dark/light theme toggle.
//
// # Quick start
//
//	package main
//
//	import (
//		"log"
//
//		"github.com/escu-io/go-report-builder/covhtml"
//	)
//
//	func main() {
//		err := covhtml.Generate(covhtml.Options{
//			Profiles:   []covhtml.ProfileInput{{Path: "cover.out"}},
//			OutputPath: "coverage-report.html",
//		})
//		if err != nil {
//			log.Fatal(err)
//		}
//	}
//
// # Multiple runs
//
// Pass more than one [ProfileInput] to compare or merge coverage across runs
// (for example unit and integration suites). By default a statement block is
// considered covered if it is hit in any run (union semantics):
//
//	covhtml.Generate(covhtml.Options{
//		Profiles: []covhtml.ProfileInput{
//			{Path: "unit.out", Label: "unit"},
//			{Path: "integration.out", Label: "integration"},
//		},
//		OutputPath: "coverage-report.html",
//	})
//
// # Discovery
//
// By default the report discovers every .go file under the module root and
// treats files absent from the profiles as 0% covered, giving a complete map
// of the codebase. Set [Options.ProfileOnly] to restrict the report to files
// that actually appear in the profiles.
package covhtml
