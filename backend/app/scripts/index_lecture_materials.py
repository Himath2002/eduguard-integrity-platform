from app.db.session import SessionLocal
from app.services.integrity_service import index_lecture_materials_from_folder


def main() -> None:
    db = SessionLocal()
    try:
        result = index_lecture_materials_from_folder(db)
        print(f"Lecture material indexing complete: {result}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
