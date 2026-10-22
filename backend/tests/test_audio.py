import unittest
import numpy as np
from audio import pcm16_to_float32, SAMPLE_RATE, CHUNK_BYTES


class TestPCM(unittest.TestCase):
    def test_pcm_zero_and_extremes(self):
        pcm = np.array([0, 32767, -32768], dtype="<i2").tobytes()
        a = pcm16_to_float32(pcm)
        self.assertEqual(a.dtype, np.float32)
        self.assertEqual(a[0], 0)
        self.assertLess(a[1], 1)
        self.assertEqual(a[2], -1)

    def test_odd_byte_packet_rejected(self):
        with self.assertRaises(ValueError):
            pcm16_to_float32(b"\x01")

    def test_chunk_size(self):
        self.assertEqual(CHUNK_BYTES, SAMPLE_RATE * 10 * 2)


if __name__ == "__main__":
    unittest.main()
