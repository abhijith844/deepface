package main

import (
	"embed"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"syscall"
	"time"

	"github.com/pkg/browser"
)

//go:embed all:frontend/dist
var assets embed.FS

var pyCmd *exec.Cmd

func main() {
	// Start Python backend
	startPythonBackend()

	// Clean shutdown on Ctrl+C or kill signals
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-c
		shutdown()
		os.Exit(0)
	}()

	// Serve the React static build
	distFS, err := fs.Sub(assets, "frontend/dist")
	if err != nil {
		fmt.Printf("Failed to locate embedded assets: %v\n", err)
		shutdown()
		os.Exit(1)
	}

	http.Handle("/", http.FileServer(http.FS(distFS)))

	// Open browser in a separate goroutine after a short delay
	go func() {
		time.Sleep(1500 * time.Millisecond)
		url := "http://localhost:8080"
		fmt.Printf("Opening browser to %s...\n", url)
		_ = browser.OpenURL(url)
	}()

	fmt.Println("DeepFace Swap Server running on http://localhost:8080")
	err = http.ListenAndServe(":8080", nil)
	if err != nil {
		fmt.Printf("Server failed: %v\n", err)
	}
	shutdown()
}

func startPythonBackend() {
	cwd, err := os.Getwd()
	if err != nil {
		fmt.Printf("Failed to get working dir: %v\n", err)
		return
	}

	var pyPath string
	var scriptPath string

	// Determine virtual environment python executable path based on OS
	var venvPyName string
	if runtime.GOOS == "windows" {
		venvPyName = filepath.Join("Scripts", "python.exe")
	} else {
		venvPyName = filepath.Join("bin", "python")
	}

	// Find backend.py first
	scriptPath = filepath.Join(cwd, "..", "backend.py")
	if _, err := os.Stat(scriptPath); os.IsNotExist(err) {
		scriptPath = filepath.Join(cwd, "backend.py")
	}

	// Find venv python relative to backend.py directory
	backendDir := filepath.Dir(scriptPath)
	pyPath = filepath.Join(backendDir, ".venv", venvPyName)

	// If virtual environment Python is not found, find system python
	if _, err := os.Stat(pyPath); os.IsNotExist(err) {
		if runtime.GOOS == "windows" {
			fmt.Println("Virtualenv Python not found, looking for system python...")
			pyPath = "python"
		} else {
			fmt.Println("Virtualenv Python not found, looking for system python3...")
			pyPath = "python3"
		}
	}

	fmt.Printf("Starting Python backend: %s %s\n", pyPath, scriptPath)
	cmd := exec.Command(pyPath, scriptPath)

	prepareCmd(cmd)

	cmd.Dir = filepath.Dir(scriptPath)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	err = cmd.Start()
	if err != nil {
		fmt.Printf("Failed to start Python backend: %v\n", err)
		return
	}

	pyCmd = cmd
	fmt.Printf("Python backend started with PID %d\n", cmd.Process.Pid)
}

func shutdown() {
	if pyCmd != nil && pyCmd.Process != nil {
		fmt.Println("Shutting down Python backend...")
		killProcess(pyCmd)
	}
}
