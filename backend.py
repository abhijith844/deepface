import cv2
import urllib.request
import os
import sys

if os.name == 'nt':
    # Add CUDA 12 DLLs from pip packages to the Windows DLL search path
    for p in sys.path:
        for lib in ['cublas', 'cudnn', 'cuda_nvrtc', 'cuda_runtime', 'cufft', 'curand', 'cusolver', 'cusparse', 'nvjitlink']:
            dll_dir = os.path.join(p, 'nvidia', lib, 'bin')
            if os.path.exists(dll_dir):
                os.add_dll_directory(dll_dir)
                os.environ['PATH'] = dll_dir + os.path.pathsep + os.environ['PATH']

import insightface
from insightface.app import FaceAnalysis
from flask import Flask, Response, request, jsonify
import numpy as np
import threading
import time

app = Flask(__name__)

MODEL_URL = "https://huggingface.co/ezioruan/inswapper_128.onnx/resolve/main/inswapper_128.onnx"
MODEL_PATH = "inswapper_128.onnx"

face_analyzer = None
swapper = None
source_face = None
cap = None
cap_lock = threading.Lock()
current_camera_index = 0

def open_camera(index):
    c = open_camera_test(index)
    if c is None:
        c = cv2.VideoCapture(index)
    if c is not None and c.isOpened():
        c.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    return c

def open_camera_test(index):
    import time
    # Try different backends on Windows
    if os.name == 'nt':
        # Try MSMF
        c = cv2.VideoCapture(index, cv2.CAP_MSMF)
        if c.isOpened():
            # Try reading multiple times (warm-up loop)
            for _ in range(5):
                ret, _ = c.read()
                if ret:
                    return c
                time.sleep(0.1)
            c.release()
        # Try DSHOW
        c = cv2.VideoCapture(index, cv2.CAP_DSHOW)
        if c.isOpened():
            for _ in range(5):
                ret, _ = c.read()
                if ret:
                    return c
                time.sleep(0.1)
            c.release()
        # Try Auto
        c = cv2.VideoCapture(index)
        if c.isOpened():
            for _ in range(5):
                ret, _ = c.read()
                if ret:
                    return c
                time.sleep(0.1)
            c.release()
    else:
        c = cv2.VideoCapture(index)
        if c.isOpened():
            return c
    return None


def init_models():
    global face_analyzer, swapper, cap
    print("Loading AI Models...")
    if not os.path.exists(MODEL_PATH):
        urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
    
    providers = ['CUDAExecutionProvider', 'CPUExecutionProvider']
    face_analyzer = FaceAnalysis(name='buffalo_l', providers=providers)
    face_analyzer.prepare(ctx_id=0, det_size=(640, 640))
    swapper = insightface.model_zoo.get_model(MODEL_PATH, providers=providers)
    
    with cap_lock:
        cap = open_camera(0)
    print("Backend Ready! Listening on http://127.0.0.1:5000")

enable_swapping = True

@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

@app.route('/status', methods=['GET'])
def get_status():
    return jsonify({
        "status": "ready" if face_analyzer is not None else "initializing",
        "face_loaded": source_face is not None,
        "swapping_enabled": enable_swapping,
        "current_camera": current_camera_index
    })

@app.route('/cameras', methods=['GET'])
def get_cameras():
    available = []
    # Scan camera indices 0-4
    for i in range(5):
        if i == current_camera_index:
            available.append(i)
            continue
            
        temp_cap = open_camera_test(i)
        if temp_cap is not None:
            available.append(i)
            temp_cap.release()
            
    if not available:
        available = [0]
        
    return jsonify({
        "cameras": available,
        "current": current_camera_index
    })

@app.route('/set_camera', methods=['POST'])
def set_camera():
    global cap, current_camera_index
    data = request.json or {}
    new_index = int(data.get('index', 0))
    
    with cap_lock:
        if cap is not None:
            cap.release()
        
        cap = open_camera(new_index)
        current_camera_index = new_index
        
    return jsonify({
        "success": True,
        "camera_index": new_index
    })

@app.route('/toggle_swap', methods=['POST'])
def toggle_swap():
    global enable_swapping
    data = request.json or {}
    enable_swapping = data.get('enabled', not enable_swapping)
    return jsonify({"success": True, "swapping_enabled": enable_swapping})

@app.route('/set_face', methods=['POST'])
def set_face():
    global source_face
    file = request.files.get('image')
    if not file:
        return jsonify({"error": "No image uploaded"}), 400
        
    npimg = np.frombuffer(file.read(), np.uint8)
    img = cv2.imdecode(npimg, cv2.IMREAD_COLOR)
    
    if face_analyzer is None:
        return jsonify({"error": "AI Models are still initializing"}), 503
        
    faces = face_analyzer.get(img)
    if len(faces) == 0:
        return jsonify({"error": "No face detected in image"}), 400
        
    source_face = faces[0]
    return jsonify({"success": True, "message": "Face loaded successfully"})

def generate_frames():
    import time
    while True:
        frame = None
        with cap_lock:
            if cap is not None and cap.isOpened():
                ret, frame = cap.read()
                if ret and frame is not None:
                    frame = cv2.flip(frame, 1)
                else:
                    frame = None
                
        if frame is None:
            # Fallback to generating a dummy demo frame
            # A dark slate blue background
            frame = np.zeros((480, 640, 3), dtype=np.uint8)
            frame[:] = (20, 15, 10) # BGR (dark background)
            
            # Draw grid lines for a high-tech radar/HUD feel
            for y in range(0, 480, 40):
                cv2.line(frame, (0, y), (640, y), (40, 30, 20), 1)
            for x in range(0, 640, 40):
                cv2.line(frame, (x, 0), (x, 480), (40, 30, 20), 1)

            # Draw a simulated face block for demo purposes if a source face is loaded
            if source_face is not None:
                # Bouncing bounding box coordinates
                t = time.time()
                cx = int(320 + 120 * np.sin(t * 2))
                cy = int(240 + 60 * np.cos(t * 1.5))
                w, h = 120, 150
                x1, y1 = cx - w//2, cy - h//2
                x2, y2 = cx + w//2, cy + h//2
                
                # Draw bounding box
                cv2.rectangle(frame, (x1, y1), (x2, y2), (254, 242, 0), 2)
                cv2.putText(frame, "DETECTED TARGET (SIMULATED)", (x1, y1 - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.4, (254, 242, 0), 1)
                
                if enable_swapping:
                    cv2.putText(frame, "NEURAL SWAP: ACTIVE", (x1, y2 + 20),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 230, 118), 1)
                else:
                    cv2.putText(frame, "NEURAL SWAP: BYPASSED", (x1, y2 + 20),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 74, 74), 1)
            else:
                cv2.putText(frame, "NO PHYSICAL WEBCAM DETECTED", (140, 200),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 74, 74), 1)
                cv2.putText(frame, "RUNNING IN SIMULATION MODE", (150, 230),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 242, 254), 1)
                cv2.putText(frame, "Upload source face to simulate tracking", (145, 270),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.45, (140, 155, 165), 1)
            
            # Show a clock or scanning state
            cv2.putText(frame, f"SYS TIME: {time.strftime('%H:%M:%S')}", (20, 450),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.4, (140, 155, 165), 1)
            
            time.sleep(0.05) # ~20 FPS
            
        else:
            if enable_swapping and source_face is not None and swapper is not None and face_analyzer is not None:
                try:
                    faces = face_analyzer.get(frame)
                    res = frame.copy()
                    for face in faces:
                        res = swapper.get(res, face, source_face, paste_back=True)
                    frame = res
                except Exception as e:
                    print(f"Error during face swap: {e}")

        # Encode frame as JPEG
        ret, buffer = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
        frame_bytes = buffer.tobytes()
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

@app.route('/video_feed')
def video_feed():
    return Response(generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

if __name__ == '__main__':
    init_models()
    # Run the server
    app.run(host='127.0.0.1', port=5000, threaded=True)
