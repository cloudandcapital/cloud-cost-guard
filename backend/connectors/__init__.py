"""
Cloud connector registry.

Each connector checks its own env vars. If none are set the app falls back
to synthetic data automatically — no code changes needed.
"""

from .aws_connector import AWSConnector
from .azure_connector import AzureConnector
from .gcp_connector import GCPConnector

_connectors = {
    "aws":   AWSConnector(),
    "azure": AzureConnector(),
    "gcp":   GCPConnector(),
}


def get_connector(cloud: str):
    """Return a configured connector or None (triggers synthetic fallback)."""
    c = _connectors.get(cloud)
    return c if (c and c.is_configured()) else None


def configured_clouds():
    """List which clouds have live credentials configured."""
    return [name for name, c in _connectors.items() if c.is_configured()]
