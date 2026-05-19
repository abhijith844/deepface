import React, { useState, useEffect, useRef } from 'react';
import './App.css';

export default function App() {
  const [backendStatus, setBackendStatus] = useState<'offline' | 'initializing' | 'ready'>('offline');
  const [faceLoaded, setFaceLoaded] = useState(false);
  const [swappingEnabled, setSwappingEnabled] = useState(true);
  const [sourceFacePreview, setSourceFacePreview] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>(['System started. Checking connection...']);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Camera selection states
  const [availableCameras, setAvailableCameras] = useState<number[]>([0]);
  const [currentCamera, setCurrentCamera] = useState<number>(0);

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [`[${time}] ${msg}`, ...prev.slice(0, 49)]);
  };

  // Poll backend status
  useEffect(() => {
    let intervalId: any;
    let consecutiveFailures = 0;

    const checkStatus = async () => {
      try {
        const resp = await fetch('http://127.0.0.1:5000/status');
        if (resp.ok) {
          consecutiveFailures = 0;
          const data = await resp.json();
          setBackendStatus(data.status);
          setFaceLoaded(data.face_loaded);
          setSwappingEnabled(data.swapping_enabled);
          if (data.current_camera !== undefined) {
            setCurrentCamera(data.current_camera);
          }
        } else {
          setBackendStatus('offline');
        }
      } catch (err) {
        consecutiveFailures++;
        if (consecutiveFailures >= 2) {
          setBackendStatus('offline');
        }
      }
    };

    checkStatus();
    intervalId = setInterval(checkStatus, 1500);
    return () => clearInterval(intervalId);
  }, []);

  // Fetch available cameras when backend turns ready
  useEffect(() => {
    if (backendStatus !== 'ready') return;

    const fetchCameras = async () => {
      try {
        const resp = await fetch('http://127.0.0.1:5000/cameras');
        if (resp.ok) {
          const data = await resp.json();
          setAvailableCameras(data.cameras);
          setCurrentCamera(data.current);
          addLog(`AI Engine: Detected available input cameras: [${data.cameras.join(', ')}]`);
        }
      } catch (err) {
        addLog("System Error: Failed to fetch available cameras from backend.");
      }
    };

    fetchCameras();
  }, [backendStatus]);

  const handleCameraChange = async (index: number) => {
    addLog(`Switching video input source to Camera ${index}...`);
    try {
      const resp = await fetch('http://127.0.0.1:5000/set_camera', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setCurrentCamera(data.camera_index);
        addLog(`AI Engine: Switched active camera to Index ${data.camera_index}.`);
      } else {
        addLog("AI Engine Error: Failed to change camera source.");
      }
    } catch (err) {
      addLog("System Error: Connection to backend lost while switching cameras.");
    }
  };

  const handleUploadFace = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show preview
    const reader = new FileReader();
    reader.onload = () => {
      setSourceFacePreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    const formData = new FormData();
    formData.append('image', file);

    addLog(`Uploading source face: "${file.name}"...`);
    try {
      const resp = await fetch('http://127.0.0.1:5000/set_face', {
        method: 'POST',
        body: formData,
      });
      const data = await resp.json();
      if (resp.ok) {
        setFaceLoaded(true);
        addLog("AI Engine: Source face loaded successfully! Swapping is now active.");
      } else {
        setFaceLoaded(false);
        addLog(`AI Engine Error: ${data.error || 'Failed to analyze face'}`);
      }
    } catch (err) {
      setFaceLoaded(false);
      addLog("System Error: Connection to backend lost during face upload.");
    }
  };

  const toggleSwapping = async () => {
    const nextVal = !swappingEnabled;
    addLog(`Toggling face swap: ${nextVal ? 'ON' : 'OFF'}...`);
    try {
      const resp = await fetch('http://127.0.0.1:5000/toggle_swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextVal }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setSwappingEnabled(data.swapping_enabled);
        addLog(`AI Engine: Face swap is now ${data.swapping_enabled ? 'enabled' : 'disabled'}.`);
      }
    } catch (err) {
      addLog("System Error: Failed to toggle swapping. Check if backend is online.");
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="dashboard-container">
      {/* Top Navigation */}
      <header className="navbar">
        <div className="nav-logo">
          <div className="cyber-ring"></div>
          <span className="logo-text">DEEPFACE <span className="neon-text">SWAP</span></span>
        </div>
        
        <div className="status-badges">
          <div className={`badge ${backendStatus}`}>
            <span className="pulse-dot"></span>
            AI ENGINE: {backendStatus.toUpperCase()}
          </div>
          <div className={`badge ${faceLoaded ? 'loaded' : 'unloaded'}`}>
            FACE PROFILE: {faceLoaded ? 'MAPPED' : 'EMPTY'}
          </div>
        </div>
      </header>

      {/* Main Grid Layout */}
      <main className="dashboard-grid">
        {/* Left Side: Control panel */}
        <section className="card control-panel">
          <div className="card-header">
            <h3>Control Center</h3>
            <span className="sub-title">Configure AI source & pipeline</span>
          </div>

          <div className="card-body">
            {/* Step 1: Face Target Upload */}
            <div className="control-group">
              <label className="group-label">1. Target Swap Face</label>
              
              <div 
                className={`dropzone ${sourceFacePreview ? 'has-image' : ''}`}
                onClick={triggerFileSelect}
              >
                {sourceFacePreview ? (
                  <div className="preview-wrapper">
                    <img src={sourceFacePreview} className="face-preview-img" alt="Source" />
                    <div className="preview-overlay">
                      <span>Change Face</span>
                    </div>
                  </div>
                ) : (
                  <div className="dropzone-placeholder">
                    <svg viewBox="0 0 24 24" width="36" height="36" stroke="currentColor" strokeWidth="1.5" fill="none">
                      <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <p className="primary-text">Upload Source Image</p>
                    <p className="secondary-text">PNG, JPG up to 10MB</p>
                  </div>
                )}
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden-file-input" 
                onChange={handleUploadFace}
                accept="image/*"
              />
            </div>

            {/* Step 2: Camera selection dropdown */}
            <div className="control-group">
              <label className="group-label">2. Input Camera Source</label>
              <div className="select-container">
                <select 
                  value={currentCamera} 
                  onChange={(e) => handleCameraChange(Number(e.target.value))}
                  disabled={backendStatus !== 'ready'}
                  className="cyber-select"
                >
                  {availableCameras.map(camId => (
                    <option key={camId} value={camId}>
                      Camera {camId} {camId === 0 ? ' (Default)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Step 3: Toggle Switch for live swap */}
            <div className="control-group">
              <div className="toggle-wrapper">
                <div className="toggle-info">
                  <span className="toggle-title">3. Real-Time Swapping</span>
                  <span className="toggle-desc">Toggle neural face replacement</span>
                </div>
                <button 
                  onClick={toggleSwapping}
                  disabled={backendStatus !== 'ready' || !faceLoaded}
                  className={`toggle-button ${swappingEnabled && faceLoaded ? 'active' : ''}`}
                >
                  <div className="toggle-handle"></div>
                </button>
              </div>
            </div>

            {/* Pipeline Configuration Details */}
            <div className="control-group spec-table">
              <label className="group-label">Hardware & AI Pipeline</label>
              <div className="spec-row">
                <span className="spec-name">Detection Model</span>
                <span className="spec-val">buffalo_l (insightface)</span>
              </div>
              <div className="spec-row">
                <span className="spec-name">Swapping Model</span>
                <span className="spec-val">inswapper_128 (onnx)</span>
              </div>
              <div className="spec-row">
                <span className="spec-name">Host Backend</span>
                <span className="spec-val">127.0.0.1:5000</span>
              </div>
              <div className="spec-row">
                <span className="spec-name">Processing Unit</span>
                <span className="spec-val highlight">ONNX CPU/GPU</span>
              </div>
            </div>
          </div>
        </section>

        {/* Right Side: Stream Render Window */}
        <section className="card stream-panel">
          <div className="card-header stream-header">
            <div className="header-info">
              <h3>Live Swap Monitor</h3>
              <span className="sub-title">Feed from default camera</span>
            </div>
            {backendStatus === 'ready' && (
              <span className="fps-indicator">LIVE FEED ACTIVE</span>
            )}
          </div>

          <div className="stream-viewport-wrapper">
            {backendStatus === 'ready' ? (
              <div className="stream-viewport">
                <img 
                  src="http://127.0.0.1:5000/video_feed" 
                  alt="Live Camera Feed"
                  className="live-video-stream"
                  onError={() => {
                    // Fail gracefully if stream disconnects temporarily
                    setBackendStatus('offline');
                  }}
                />
                
                {/* HUD overlays */}
                <div className="hud-corner top-left"></div>
                <div className="hud-corner top-right"></div>
                <div className="hud-corner bottom-left"></div>
                <div className="hud-corner bottom-right"></div>
                
                <div className="scanner-line"></div>
                
                {!faceLoaded && (
                  <div className="hud-warning-overlay">
                    <div className="warning-content">
                      <svg viewBox="0 0 24 24" width="48" height="48" stroke="#ffb300" strokeWidth="1.5" fill="none">
                        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M12 9v4M12 17h.01" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <h4>Source Face Required</h4>
                      <p>Upload a target swap face in the left panel to begin neural swapping.</p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="stream-offline-placeholder">
                <div className="offline-glow"></div>
                {backendStatus === 'initializing' ? (
                  <div className="loader-content">
                    <div className="cyber-spinner"></div>
                    <h4>AI Engine Initializing</h4>
                    <p>Loading InsightFace libraries and ONNX weights...</p>
                  </div>
                ) : (
                  <div className="loader-content">
                    <div className="offline-icon">
                      <svg viewBox="0 0 24 24" width="48" height="48" stroke="#ff4a4a" strokeWidth="1.5" fill="none">
                        <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.5m-5.46-5.46a10.89 10.89 0 013.92 1.43m-9.87.52A10.9 10.9 0 001.5 12.5M5 16.5A10.74 10.74 0 0012 21.5a10.77 10.77 0 005.8-1.72M8 12.5a4 4 0 014-4M10 14.5a3.5 3.5 0 012.5-2.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <h4>AI Backend Offline</h4>
                    <p>Go backend is attempting to start backend.py, or python server not reachable.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Footer Console Logs */}
      <footer className="console-panel">
        <div className="console-header">
          <div className="console-title">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none">
              <path d="M4 17l6-6-6-6M12 19h8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>CONSOLE LOGS</span>
          </div>
          <span className="console-port">Port: 5000</span>
        </div>
        <div className="console-logs-list">
          {logs.map((log, index) => (
            <div key={index} className="log-row">
              <span className="log-marker">&gt;</span>
              <span className="log-text">{log}</span>
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
}
