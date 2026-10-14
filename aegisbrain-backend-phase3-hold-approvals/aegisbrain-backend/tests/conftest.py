"""Test defaults: exercise the explicitly supported local development profile."""

import pytest

from app.config import settings


@pytest.fixture(autouse=True)
def use_development_profile_for_local_api_tests(monkeypatch):
    # Existing contract tests cover the credential-free local playground mode.
    # Individual tests can override this to verify non-development behavior.
    monkeypatch.setattr(settings, "app_env", "development")
