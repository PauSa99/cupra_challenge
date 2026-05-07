"""
Shared mutable state dictionary accessible by both main.py and tools.py
without circular imports. main.py populates it; tools.py reads it for
runtime safety guards (e.g. seat rotation while moving).
"""

live_state: dict = {}
