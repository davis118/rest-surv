"""Surveillance.ai backend."""
import os

# The tracker's Kalman filters solve tiny matrices; OpenBLAS's thread pool makes each solve
# slower and keeps every core spinning. Must be set before numpy is first imported.
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
