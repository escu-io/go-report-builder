package render

import (
	"bytes"
	"embed"
	"encoding/json"
	"fmt"
	"html/template"
	"io"
	"os"
	"path/filepath"

	"github.com/escu-io/go-report-builder/internal/model"
)

//go:embed web/*
var webFS embed.FS

// Payload is the JSON embedded in the HTML report.
type Payload struct {
	ModulePath   string                       `json:"modulePath"`
	OverallPct   float64                      `json:"overallPct"`
	TotalStmts   int                          `json:"totalStmts"`
	CoveredStmts int                          `json:"coveredStmts"`
	Runs         []model.RunInfo              `json:"runs"`
	Tree         *model.TreeNode              `json:"tree"`
	Files        map[string]FileJSON          `json:"files"`
	FileDetails  map[string]*model.FileDetail `json:"fileDetails"`
	Colors       ColorProfile                 `json:"colors"`
}

type FileJSON struct {
	ImportPath   string          `json:"importPath"`
	RelPath      string          `json:"relPath"`
	TotalStmts   int             `json:"totalStmts"`
	CoveredStmts int             `json:"coveredStmts"`
	Percent      float64         `json:"percent"`
	RunCoverage  map[string]bool `json:"runCoverage"`
}

type ColorProfile struct {
	Name string `json:"name"`
	Min  string `json:"min"`
	Mid  string `json:"mid"`
	Max  string `json:"max"`
}

var defaultColors = ColorProfile{
	Name: "default",
	Min:  "#ef4444",
	Mid:  "#f59e0b",
	Max:  "#22c55e",
}

// HTML writes a self-contained coverage report.
func HTML(w io.Writer, report *model.Report) error {
	files := make(map[string]FileJSON, len(report.Files))
	for k, fc := range report.Files {
		files[k] = FileJSON{
			ImportPath:   fc.ImportPath,
			RelPath:      fc.RelPath,
			TotalStmts:   fc.TotalStmts,
			CoveredStmts: fc.CoveredStmts,
			Percent:      fc.Percent,
			RunCoverage:  fc.RunCoverage,
		}
	}

	payload := Payload{
		ModulePath:   report.ModulePath,
		OverallPct:   report.OverallPct,
		TotalStmts:   report.TotalStmts,
		CoveredStmts: report.CoveredStmts,
		Runs:         report.Runs,
		Tree:         report.Tree,
		Files:        files,
		FileDetails:  report.FileDetails,
		Colors:       defaultColors,
	}

	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	tmplBytes, err := webFS.ReadFile("web/index.html")
	if err != nil {
		return fmt.Errorf("read template: %w", err)
	}
	cssBytes, err := webFS.ReadFile("web/style.css")
	if err != nil {
		return fmt.Errorf("read css: %w", err)
	}
	jsBytes, err := webFS.ReadFile("web/app.js")
	if err != nil {
		return fmt.Errorf("read js: %w", err)
	}

	tmpl, err := template.New("report").Parse(string(tmplBytes))
	if err != nil {
		return err
	}

	type pageData struct {
		Data template.JS
		CSS  template.CSS
		JS   template.JS
	}

	var buf bytes.Buffer
	err = tmpl.Execute(&buf, pageData{
		Data: template.JS(data),
		CSS:  template.CSS(cssBytes),
		JS:   template.JS(jsBytes),
	})
	if err != nil {
		return err
	}
	_, err = w.Write(buf.Bytes())
	return err
}

// WriteFile renders the report to a path, creating parent directories as needed.
func WriteFile(path string, report *model.Report) error {
	if dir := filepath.Dir(path); dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return fmt.Errorf("create output directory: %w", err)
		}
	}
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	return HTML(f, report)
}
