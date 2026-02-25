"""
Unit tests for MIME type detection.

Tests the detect_mime_type() function from app.s3 module.
"""

import pytest
from app.s3 import detect_mime_type


@pytest.mark.unit
class TestMimeDetection:
    """Tests for MIME type detection function."""
    
    def test_detect_png_by_content(self):
        """Test PNG detection using magic bytes."""
        # PNG magic bytes
        png_content = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89'
        
        mime_type = detect_mime_type("test.png", png_content)
        assert mime_type == "image/png"
    
    def test_detect_jpeg_by_content(self):
        """Test JPEG detection using magic bytes."""
        # JPEG magic bytes
        jpeg_content = b'\xff\xd8\xff\xe0\x00\x10JFIF'
        
        mime_type = detect_mime_type("test.jpg", jpeg_content)
        assert mime_type == "image/jpeg"
    
    def test_detect_pdf_by_content(self):
        """Test PDF detection using magic bytes."""
        # PDF magic bytes
        pdf_content = b'%PDF-1.4'
        
        mime_type = detect_mime_type("test.pdf", pdf_content)
        assert mime_type == "application/pdf"
    
    def test_detect_text_by_content(self):
        """Test plain text detection."""
        text_content = b'This is plain text content'
        
        mime_type = detect_mime_type("test.txt", text_content)
        assert mime_type == "text/plain"
    
    def test_detect_json_by_content(self):
        """Test JSON detection."""
        json_content = b'{"key": "value"}'
        
        mime_type = detect_mime_type("test.json", json_content)
        # Should detect as text or application/json
        assert "json" in mime_type.lower() or "text" in mime_type.lower()
    
    def test_fallback_to_extension_txt(self):
        """Test fallback to extension when content not provided."""
        mime_type = detect_mime_type("document.txt", None)
        assert mime_type == "text/plain"
    
    def test_fallback_to_extension_html(self):
        """Test fallback to extension for HTML."""
        mime_type = detect_mime_type("index.html", None)
        assert mime_type == "text/html"
    
    def test_fallback_to_extension_css(self):
        """Test fallback to extension for CSS."""
        mime_type = detect_mime_type("style.css", None)
        assert mime_type == "text/css"
    
    def test_fallback_to_extension_js(self):
        """Test fallback to extension for JavaScript."""
        mime_type = detect_mime_type("script.js", None)
        assert mime_type in ["application/javascript", "text/javascript"]
    
    def test_fallback_to_extension_zip(self):
        """Test fallback to extension for ZIP."""
        mime_type = detect_mime_type("archive.zip", None)
        assert mime_type == "application/zip"
    
    def test_unknown_extension_default(self):
        """Test unknown extension falls back to octet-stream."""
        mime_type = detect_mime_type("file.xyz123unknown", None)
        assert mime_type == "application/octet-stream"
    
    def test_no_extension_default(self):
        """Test file with no extension."""
        mime_type = detect_mime_type("README", None)
        # Could be text/plain or octet-stream depending on content detection
        assert mime_type in ["text/plain", "application/octet-stream"]
    
    def test_wrong_extension_correct_content(self):
        """Test that content detection overrides wrong extension."""
        # PNG content but .txt extension
        png_content = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89'
        
        mime_type = detect_mime_type("not-really.txt", png_content)
        # Content-based detection should win
        assert mime_type == "image/png"
    
    def test_case_insensitive_extension(self):
        """Test extension detection is case-insensitive."""
        mime_type_upper = detect_mime_type("FILE.TXT", None)
        mime_type_lower = detect_mime_type("file.txt", None)
        
        assert mime_type_upper == mime_type_lower
        assert mime_type_upper == "text/plain"
    
    def test_common_image_extensions(self):
        """Test common image file extensions."""
        assert detect_mime_type("photo.jpg", None) == "image/jpeg"
        assert detect_mime_type("photo.jpeg", None) == "image/jpeg"
        assert detect_mime_type("image.png", None) == "image/png"
        assert detect_mime_type("graphic.gif", None) == "image/gif"
        assert detect_mime_type("image.webp", None) == "image/webp"
    
    def test_common_video_extensions(self):
        """Test common video file extensions."""
        assert detect_mime_type("video.mp4", None) == "video/mp4"
        assert detect_mime_type("video.webm", None) == "video/webm"
        assert detect_mime_type("movie.avi", None) in ["video/x-msvideo", "video/avi"]
    
    def test_common_audio_extensions(self):
        """Test common audio file extensions."""
        assert detect_mime_type("song.mp3", None) == "audio/mpeg"
        assert detect_mime_type("audio.wav", None) in ["audio/wav", "audio/x-wav"]
        assert detect_mime_type("sound.ogg", None) == "application/ogg"
    
    def test_common_document_extensions(self):
        """Test common document file extensions."""
        assert detect_mime_type("doc.pdf", None) == "application/pdf"
        assert detect_mime_type("spreadsheet.csv", None) == "text/csv"
        assert detect_mime_type("data.xml", None) in ["application/xml", "text/xml"]
