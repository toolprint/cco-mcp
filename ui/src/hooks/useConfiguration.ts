import { useState, useEffect, useCallback } from "react";
import type { CCOMCPConfig } from "../types/config";

export function useConfiguration() {
  const [config, setConfig] = useState<CCOMCPConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/config");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setConfig(data.config);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch configuration"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const updateConfig = useCallback(async (newConfig: CCOMCPConfig) => {
    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/config", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ config: newConfig }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || `HTTP error! status: ${response.status}`
        );
      }

      const data = await response.json();
      setConfig(data.config);
      return { success: true };
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to update configuration";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setSaving(false);
    }
  }, []);

  const patchConfig = useCallback(
    async (partialConfig: Partial<CCOMCPConfig>) => {
      setSaving(true);
      setError(null);

      try {
        const response = await fetch("/api/config", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(partialConfig),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.error || `HTTP error! status: ${response.status}`
          );
        }

        const data = await response.json();
        setConfig(data.config);
        return { success: true };
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to update configuration";
        setError(errorMessage);
        return { success: false, error: errorMessage };
      } finally {
        setSaving(false);
      }
    },
    []
  );

  const validateConfig = useCallback(async (configToValidate: CCOMCPConfig) => {
    try {
      const response = await fetch("/api/config/validate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ config: configToValidate }),
      });

      const data = await response.json();
      return {
        valid: response.ok,
        errors: data.errors || [],
      };
    } catch (err) {
      return {
        valid: false,
        errors: [err instanceof Error ? err.message : "Validation failed"],
      };
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  return {
    config,
    loading,
    error,
    saving,
    refetch: fetchConfig,
    updateConfig,
    patchConfig,
    validateConfig,
  };
}
