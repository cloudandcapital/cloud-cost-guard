"""
Cloud connector registry.

Each reference connector checks its own environment configuration. The public
dashboard does not call this registry; private deployments must wire and secure
the desired adapters explicitly.
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
    """Return a configured reference connector or None."""
    c = _connectors.get(cloud)
    return c if (c and c.is_configured()) else None


def configured_clouds():
    """List which clouds have live credentials configured."""
    return [name for name, c in _connectors.items() if c.is_configured()]
