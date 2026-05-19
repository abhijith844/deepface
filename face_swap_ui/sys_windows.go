//go:build windows
package main

import (
	"os/exec"
)

func prepareCmd(cmd *exec.Cmd) {
	// No platform-specific attributes required on Windows
}

func killProcess(cmd *exec.Cmd) {
	if cmd != nil && cmd.Process != nil {
		_ = cmd.Process.Kill()
	}
}
