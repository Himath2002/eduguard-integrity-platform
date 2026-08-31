from sqlalchemy import Column, Integer, Text, Boolean, DateTime, func
from app.db.base import Base


class PlatformSetting(Base):
    __tablename__ = "platform_settings"

    id = Column(Integer, primary_key=True, default=1)
    plagiarism_threshold = Column(Integer, nullable=False, default=10, server_default="10")
    ai_threshold = Column(Integer, nullable=False, default=15, server_default="15")
    allow_pdf = Column(Boolean, nullable=False, default=True, server_default="true")
    allow_word = Column(Boolean, nullable=False, default=True, server_default="true")
    allow_text = Column(Boolean, nullable=False, default=True, server_default="true")
    allow_markdown = Column(Boolean, nullable=False, default=False, server_default="false")
    allow_html = Column(Boolean, nullable=False, default=False, server_default="false")
    two_factor_mode = Column(Text, nullable=False, default="optional", server_default="optional")
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class AdminAnnouncement(Base):
    __tablename__ = "admin_announcements"

    id = Column(Integer, primary_key=True)
    audience = Column(Text, nullable=False, default="all", server_default="all")
    subject = Column(Text, nullable=False)
    body = Column(Text, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")
    created_by = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
