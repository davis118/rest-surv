"""The employee directory: who is registered, and whose face an embedding is.

Only the face embedding and the text fields are kept, never the image.
"""
import threading
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

import numpy as np

from .settings import FACE_MATCH_THRESHOLD


@dataclass(frozen=True)
class Employee:
    id: str
    name: str
    role: str
    notes: str
    created_at: str        # ISO 8601, UTC
    embedding: np.ndarray  # unit-length face embedding

    def public(self):
        """The record as sent to the page: everything but the embedding."""
        return {"id": self.id, "name": self.name, "role": self.role, "notes": self.notes, "created_at": self.created_at}


class EmployeeDirectory:
    """In-memory store, safe to use from any thread. Replace this class to change the storage."""

    def __init__(self):
        self.lock = threading.Lock()
        self.employees = {}  # id -> Employee

    def __len__(self):
        return len(self.employees)

    def add(self, name, role, notes, embedding):
        """Registers one face. The same person may be added again: each record is matched on its own."""
        created_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
        employee = Employee(uuid.uuid4().hex, name, role, notes, created_at, embedding)
        with self.lock:
            self.employees[employee.id] = employee
        return employee

    def all(self):
        with self.lock:
            return list(self.employees.values())

    def get(self, employee_id):
        return self.employees.get(employee_id)

    def remove(self, employee_id):
        """True if there was such an employee."""
        with self.lock:
            return self.employees.pop(employee_id, None) is not None

    def match(self, embedding):
        """The employee this face most resembles and the cosine similarity, or None if nobody is close enough."""
        scored = [(float(employee.embedding @ embedding), employee) for employee in self.all()]
        score, employee = max(scored, key=lambda pair: pair[0], default=(0.0, None))
        return (employee, score) if score >= FACE_MATCH_THRESHOLD else None
