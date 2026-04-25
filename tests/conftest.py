from dotenv import load_dotenv


def pytest_configure():
    """Load environment variables before any tests run."""
    load_dotenv()
