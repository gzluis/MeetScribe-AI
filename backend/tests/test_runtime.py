import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

from runtime import resolve_model_name


class BundledModelTests(unittest.TestCase):
    def test_development_defaults_to_model_name(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(sys, "frozen", False, create=True):
            self.assertEqual(resolve_model_name(), "base")

    def test_custom_model_override(self):
        with patch.dict(os.environ, {"MEETSCRIBE_MODEL": "small"}):
            self.assertEqual(resolve_model_name(), "small")

    def test_bundled_requires_model(self):
        with tempfile.TemporaryDirectory() as d:
            with patch.dict(os.environ, {}, clear=True), patch.object(sys, "frozen", True, create=True), patch.object(sys, "_MEIPASS", d, create=True):
                with self.assertRaises(FileNotFoundError):
                    resolve_model_name()
                model = Path(d) / "models" / "base"
                model.mkdir(parents=True)
                (model / "model.bin").write_bytes(b"test")
                self.assertEqual(resolve_model_name(), str(model))
