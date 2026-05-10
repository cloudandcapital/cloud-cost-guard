"""
Kubernetes cost connector.

Pulls namespace spend, node pool costs, and pod efficiency metrics from
the Kubernetes Metrics Server or Prometheus.

Required env vars (one of two modes):
  Mode A — Prometheus:
    K8S_PROMETHEUS_URL     — e.g. http://prometheus.monitoring.svc:9090
    K8S_CLUSTER_NAME       — display name for the cluster

  Mode B — Kubernetes Metrics API (in-cluster or kubeconfig):
    KUBECONFIG             — path to kubeconfig (omit for in-cluster)
    K8S_CLUSTER_NAME       — display name for the cluster

Optional:
  K8S_COST_PER_CPU_HOUR   — override $/CPU/hour (default: 0.048, ~n2-standard-8)
  K8S_COST_PER_GB_HOUR    — override $/GB RAM/hour (default: 0.006)

To activate:
  1. For Prometheus mode:
       export K8S_PROMETHEUS_URL=http://your-prometheus:9090
       export K8S_CLUSTER_NAME=prod-cluster
       pip install requests

  2. For kubeconfig mode:
       export KUBECONFIG=/path/to/kubeconfig
       export K8S_CLUSTER_NAME=prod-cluster
       pip install kubernetes

  3. The app will use live data automatically; no code changes needed.
     Without credentials, synthetic data is used.
"""

import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


class K8sConnector:
    COST_PER_CPU_HOUR: float = 0.048
    COST_PER_GB_HOUR: float = 0.006

    def is_configured(self) -> bool:
        return bool(
            os.getenv("K8S_PROMETHEUS_URL") or os.getenv("KUBECONFIG") or
            os.path.exists(os.path.expanduser("~/.kube/config"))
        )

    def _cost_per_cpu_hour(self) -> float:
        try:
            return float(os.getenv("K8S_COST_PER_CPU_HOUR", self.COST_PER_CPU_HOUR))
        except (TypeError, ValueError):
            return self.COST_PER_CPU_HOUR

    def _cost_per_gb_hour(self) -> float:
        try:
            return float(os.getenv("K8S_COST_PER_GB_HOUR", self.COST_PER_GB_HOUR))
        except (TypeError, ValueError):
            return self.COST_PER_GB_HOUR

    def get_cost_data(self, window_days: int = 30) -> Dict[str, Any]:
        """
        Fetch Kubernetes cost data.

        Returns a dict with keys:
          cluster_name, total_cost, namespaces, node_pools,
          avg_node_utilization_pct, overprovisioning_waste_est, top_wasteful_workloads
        """
        if not self.is_configured():
            raise RuntimeError(
                "Kubernetes credentials not configured. "
                "Set K8S_PROMETHEUS_URL or ensure ~/.kube/config exists."
            )

        prometheus_url = os.getenv("K8S_PROMETHEUS_URL")
        if prometheus_url:
            return self._fetch_from_prometheus(prometheus_url, window_days)
        return self._fetch_from_metrics_api(window_days)

    def _fetch_from_prometheus(self, url: str, window_days: int) -> Dict[str, Any]:
        try:
            import requests
        except ImportError:
            raise RuntimeError("requests not installed. Run: pip install requests")

        cluster_name = os.getenv("K8S_CLUSTER_NAME", "k8s-cluster")
        cpu_price = self._cost_per_cpu_hour()
        mem_price = self._cost_per_gb_hour()
        hours = window_days * 24

        def prom_query(q: str) -> List[Dict]:
            resp = requests.get(f"{url}/api/v1/query", params={"query": q}, timeout=10)
            resp.raise_for_status()
            return resp.json().get("data", {}).get("result", [])

        # CPU requests per namespace (average over window)
        cpu_results = prom_query(
            f'avg_over_time(sum by (namespace) '
            f'(kube_pod_container_resource_requests{{resource="cpu",unit="core"}})[{window_days}d:1h])'
        )
        mem_results = prom_query(
            f'avg_over_time(sum by (namespace) '
            f'(kube_pod_container_resource_requests{{resource="memory",unit="byte"}})[{window_days}d:1h])'
        )

        cpu_by_ns = {r["metric"].get("namespace", "default"): float(r["value"][1]) for r in cpu_results}
        mem_by_ns = {r["metric"].get("namespace", "default"): float(r["value"][1]) / (1024**3) for r in mem_results}

        namespaces = []
        all_ns = set(cpu_by_ns) | set(mem_by_ns)
        for ns in sorted(all_ns):
            cpu = cpu_by_ns.get(ns, 0.0)
            mem_gb = mem_by_ns.get(ns, 0.0)
            ns_cost = round((cpu * cpu_price + mem_gb * mem_price) * hours, 2)
            namespaces.append({
                "namespace": ns,
                "cost": ns_cost,
                "cpu_cores_requested": round(cpu, 2),
                "memory_gb_requested": round(mem_gb, 2),
            })
        namespaces.sort(key=lambda n: n["cost"], reverse=True)

        # Node utilization
        util_results = prom_query(
            f'avg_over_time(avg by (node) '
            f'(1 - rate(node_cpu_seconds_total{{mode="idle"}}[5m]))[{window_days}d:1h])'
        )
        avg_util = 0.0
        if util_results:
            avg_util = round(sum(float(r["value"][1]) for r in util_results) / len(util_results) * 100, 1)

        total_cost = round(sum(n["cost"] for n in namespaces), 2)
        waste = round(total_cost * (1 - avg_util / 100) * 0.6, 2)

        return {
            "cluster_name": cluster_name,
            "total_cost": total_cost,
            "avg_node_utilization_pct": avg_util,
            "overprovisioning_waste_est": waste,
            "namespaces": namespaces,
            "node_pools": [],
            "top_wasteful_workloads": [n for n in namespaces if n["cost"] > 0][:5],
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "source": "prometheus",
        }

    def _fetch_from_metrics_api(self, window_days: int) -> Dict[str, Any]:
        try:
            from kubernetes import client, config as k8s_config
        except ImportError:
            raise RuntimeError("kubernetes not installed. Run: pip install kubernetes")

        cluster_name = os.getenv("K8S_CLUSTER_NAME", "k8s-cluster")
        kubeconfig = os.getenv("KUBECONFIG")
        if kubeconfig:
            k8s_config.load_kube_config(kubeconfig)
        else:
            try:
                k8s_config.load_incluster_config()
            except k8s_config.ConfigException:
                k8s_config.load_kube_config()

        v1 = client.CoreV1Api()
        cpu_price = self._cost_per_cpu_hour()
        mem_price = self._cost_per_gb_hour()
        hours = window_days * 24

        pods = v1.list_pod_for_all_namespaces(watch=False)
        ns_cpu: Dict[str, float] = {}
        ns_mem: Dict[str, float] = {}
        for pod in pods.items:
            ns = pod.metadata.namespace
            for container in (pod.spec.containers or []):
                reqs = (container.resources.requests or {}) if container.resources else {}
                cpu_str = reqs.get("cpu", "0")
                mem_str = reqs.get("memory", "0")
                ns_cpu[ns] = ns_cpu.get(ns, 0.0) + _parse_cpu(cpu_str)
                ns_mem[ns] = ns_mem.get(ns, 0.0) + _parse_memory_gb(mem_str)

        nodes = v1.list_node(watch=False)
        node_pools: Dict[str, Dict] = {}
        for node in nodes.items:
            labels = node.metadata.labels or {}
            pool = labels.get("cloud.google.com/gke-nodepool") or \
                   labels.get("eks.amazonaws.com/nodegroup") or \
                   labels.get("agentpool") or "default"
            if pool not in node_pools:
                node_pools[pool] = {"nodes": 0, "cost": 0.0}
            alloc = node.status.allocatable or {}
            cpu = _parse_cpu(alloc.get("cpu", "0"))
            mem_gb = _parse_memory_gb(alloc.get("memory", "0"))
            node_cost = (cpu * cpu_price + mem_gb * mem_price) * hours
            node_pools[pool]["nodes"] += 1
            node_pools[pool]["cost"] = round(node_pools[pool]["cost"] + node_cost, 2)

        namespaces = []
        for ns in sorted(set(ns_cpu) | set(ns_mem)):
            cpu = ns_cpu.get(ns, 0.0)
            mem_gb = ns_mem.get(ns, 0.0)
            ns_cost = round((cpu * cpu_price + mem_gb * mem_price) * hours, 2)
            namespaces.append({
                "namespace": ns,
                "cost": ns_cost,
                "cpu_cores_requested": round(cpu, 2),
                "memory_gb_requested": round(mem_gb, 2),
            })
        namespaces.sort(key=lambda n: n["cost"], reverse=True)

        pool_list = [{"pool": k, **v} for k, v in node_pools.items()]
        total_node_cost = sum(p["cost"] for p in pool_list) or 1.0
        total_cost = round(sum(n["cost"] for n in namespaces), 2)

        return {
            "cluster_name": cluster_name,
            "total_cost": total_cost,
            "avg_node_utilization_pct": None,
            "overprovisioning_waste_est": None,
            "namespaces": namespaces,
            "node_pools": pool_list,
            "top_wasteful_workloads": namespaces[:5],
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "source": "metrics-api",
        }


def _parse_cpu(cpu_str: str) -> float:
    s = str(cpu_str).strip()
    if s.endswith("m"):
        return float(s[:-1]) / 1000.0
    try:
        return float(s)
    except ValueError:
        return 0.0


def _parse_memory_gb(mem_str: str) -> float:
    s = str(mem_str).strip()
    suffixes = [
        ("Ki", 1024), ("Mi", 1024**2), ("Gi", 1024**3),
        ("Ti", 1024**4), ("K", 1000), ("M", 1000**2),
        ("G", 1000**3), ("T", 1000**4),
    ]
    for suffix, factor in suffixes:
        if s.endswith(suffix):
            try:
                return float(s[:-len(suffix)]) * factor / (1024**3)
            except ValueError:
                return 0.0
    try:
        return float(s) / (1024**3)
    except ValueError:
        return 0.0
