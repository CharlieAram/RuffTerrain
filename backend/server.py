"""
RuffTerrain — Backend Server
=============================
FastAPI WebSocket server that captures camera frames (robot camera with
webcam fallback), runs them through the custom YOLOv8-pose + injury
classifier pipeline, and streams annotated frames + detection results
to the frontend.

Usage:
    python server.py
    python server.py --mock   # use mock robot frames
"""

import asyncio
import base64
import json
import os
import sys
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path

import cv2
import numpy as np
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

ROOT = Path(__file__).resolve().parent.parent
CV_MODEL_DIR = ROOT / "cv_model"
sys.path.insert(0, str(CV_MODEL_DIR))

load_dotenv(Path(__file__).resolve().parent / ".env")


class State:
    def __init__(self):
        self.pose_model = None
        self.classifier = None
        self.robot = None
        self.cw = None
        self.robot_connected = False
        self.camera_source = "none"
        self.frame_b64: str | None = None
        self.detections: list[dict] = []
        self.lock = threading.Lock()
        self.clients: list[WebSocket] = []
        self.running = True
        self.use_mock = False


state = State()


def load_models():
    from ultralytics import YOLO
    import joblib
    from inference import CLASSIFIER_PATH

    print("[server] Loading CV models...")
    state.pose_model = YOLO("yolov8s-pose.pt")
    state.classifier = joblib.load(CLASSIFIER_PATH)
    print("[server] CV models ready.")


def connect_robot():
    try:
        from cyberwave import Cyberwave

        api_key = os.getenv("CYBERWAVE_API_KEY", "")
        twin_uuid = os.getenv("CYBERWAVE_TWIN_UUID", "")
        if not api_key or not twin_uuid:
            print("[robot] No credentials — robot offline")
            return
        cw = Cyberwave(api_key=api_key)
        state.cw = cw
        state.robot = cw.twin(twin_id=twin_uuid)
        state.robot_connected = True
        print(f"[robot] Connected: {state.robot.uuid}")
    except Exception as e:
        print(f"[robot] Connection failed: {e}")
        state.robot_connected = False


def camera_loop():
    from inference import process_frame

    webcam = None

    while state.running:
        frame = None

        if state.robot and state.robot_connected:
            try:
                raw = state.robot.get_latest_frame(mock=state.use_mock)
                if raw and len(raw) > 200:
                    arr = np.frombuffer(raw, dtype=np.uint8)
                    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                    if frame is not None:
                        state.camera_source = "robot"
            except Exception:
                pass

        if frame is None:
            if webcam is None or not webcam.isOpened():
                webcam = cv2.VideoCapture(0)
                if not webcam.isOpened():
                    state.camera_source = "none"
                    time.sleep(1)
                    continue
            ret, frame = webcam.read()
            if not ret or frame is None:
                state.camera_source = "none"
                time.sleep(0.1)
                continue
            state.camera_source = "webcam"

        if frame is not None and state.pose_model and state.classifier:
            try:
                annotated, dets = process_frame(
                    frame, state.pose_model, state.classifier
                )
                _, buf = cv2.imencode(
                    ".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 70]
                )
                with state.lock:
                    state.frame_b64 = base64.b64encode(buf.tobytes()).decode()
                    state.detections = dets
            except Exception as e:
                print(f"[cv] {e}")

        time.sleep(1.0 / 7)

    if webcam:
        webcam.release()


async def broadcaster():
    while state.running:
        if state.clients:
            with state.lock:
                fb = state.frame_b64
                dets = list(state.detections)

            if fb:
                payload = json.dumps({
                    "type": "frame",
                    "frame": fb,
                    "detections": dets,
                    "camera_source": state.camera_source,
                })
                gone: list[WebSocket] = []
                for ws in list(state.clients):
                    try:
                        await ws.send_text(payload)
                    except Exception:
                        gone.append(ws)
                for ws in gone:
                    if ws in state.clients:
                        state.clients.remove(ws)

        await asyncio.sleep(1.0 / 7)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    load_models()
    connect_robot()
    threading.Thread(target=camera_loop, daemon=True).start()
    task = asyncio.create_task(broadcaster())
    yield
    state.running = False
    task.cancel()


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    state.clients.append(ws)

    await ws.send_text(json.dumps({
        "type": "status",
        "robot_connected": state.robot_connected,
        "camera_source": state.camera_source,
    }))

    try:
        while True:
            raw = await ws.receive_text()
            msg = json.loads(raw)

            if msg.get("type") == "command" and state.robot and state.robot_connected:
                cmd = msg.get("command")
                try:
                    if cmd == "forward":
                        state.robot.move_forward(0.5)
                    elif cmd == "backward":
                        state.robot.move_forward(-0.5)
                    elif cmd == "left":
                        state.robot.rotate(yaw=15)
                    elif cmd == "right":
                        state.robot.rotate(yaw=-15)
                except Exception as e:
                    print(f"[cmd] {e}")
    except WebSocketDisconnect:
        if ws in state.clients:
            state.clients.remove(ws)


if __name__ == "__main__":
    import argparse
    import uvicorn

    parser = argparse.ArgumentParser(description="RuffTerrain Backend Server")
    parser.add_argument("--mock", action="store_true",
                        help="Use mock robot frames")
    args = parser.parse_args()
    state.use_mock = args.mock

    uvicorn.run(app, host="0.0.0.0", port=8000)
