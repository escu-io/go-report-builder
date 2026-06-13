package profile

import (
	"bufio"
	"fmt"
	"io"
	"strconv"
	"strings"
)

// Mode is the coverage counting mode from the profile header.
type Mode string

const (
	ModeSet    Mode = "set"
	ModeCount  Mode = "count"
	ModeAtomic Mode = "atomic"
)

// Block is a single statement block entry in a Coverage Profile.
type Block struct {
	File      string
	StartLine int
	StartCol  int
	EndLine   int
	EndCol    int
	NumStmt   int
	Count     int64
}

// Profile is a parsed Coverage Profile.
type Profile struct {
	Mode   Mode
	Blocks []Block
}

// Parse reads a standard go test -coverprofile file.
func Parse(r io.Reader) (*Profile, error) {
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	var p Profile
	lineNum := 0
	for scanner.Scan() {
		lineNum++
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		if strings.HasPrefix(line, "mode:") {
			mode := strings.TrimSpace(strings.TrimPrefix(line, "mode:"))
			switch Mode(mode) {
			case ModeSet, ModeCount, ModeAtomic:
				p.Mode = Mode(mode)
			default:
				return nil, fmt.Errorf("line %d: unknown mode %q", lineNum, mode)
			}
			continue
		}
		block, err := parseBlockLine(line)
		if err != nil {
			return nil, fmt.Errorf("line %d: %w", lineNum, err)
		}
		p.Blocks = append(p.Blocks, block)
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	if p.Mode == "" {
		return nil, fmt.Errorf("missing mode line")
	}
	return &p, nil
}

func parseBlockLine(line string) (Block, error) {
	space := strings.LastIndex(line, " ")
	if space < 0 {
		return Block{}, fmt.Errorf("invalid block line")
	}
	countStr := line[space+1:]
	rest := line[:space]

	space = strings.LastIndex(rest, " ")
	if space < 0 {
		return Block{}, fmt.Errorf("invalid block line")
	}
	numStmtStr := rest[space+1:]
	rangePart := rest[:space]

	colon := strings.Index(rangePart, ":")
	if colon < 0 {
		return Block{}, fmt.Errorf("invalid block range")
	}
	file := rangePart[:colon]
	rangeStr := rangePart[colon+1:]

	comma := strings.Index(rangeStr, ",")
	if comma < 0 {
		return Block{}, fmt.Errorf("invalid block range")
	}
	start, err := parsePos(rangeStr[:comma])
	if err != nil {
		return Block{}, err
	}
	end, err := parsePos(rangeStr[comma+1:])
	if err != nil {
		return Block{}, err
	}
	numStmt, err := strconv.Atoi(numStmtStr)
	if err != nil {
		return Block{}, fmt.Errorf("invalid numStmts: %w", err)
	}
	count, err := strconv.ParseInt(countStr, 10, 64)
	if err != nil {
		return Block{}, fmt.Errorf("invalid count: %w", err)
	}

	return Block{
		File:      file,
		StartLine: start.line,
		StartCol:  start.col,
		EndLine:   end.line,
		EndCol:    end.col,
		NumStmt:   numStmt,
		Count:     count,
	}, nil
}

type pos struct {
	line int
	col  int
}

func parsePos(s string) (pos, error) {
	dot := strings.Index(s, ".")
	if dot < 0 {
		return pos{}, fmt.Errorf("invalid position %q", s)
	}
	line, err := strconv.Atoi(s[:dot])
	if err != nil {
		return pos{}, fmt.Errorf("invalid line in %q", s)
	}
	col, err := strconv.Atoi(s[dot+1:])
	if err != nil {
		return pos{}, fmt.Errorf("invalid column in %q", s)
	}
	return pos{line: line, col: col}, nil
}
