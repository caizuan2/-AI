"use client";

import * as React from "react";
import type {
  IntegrationListData,
  IntegrationProvider,
  NotificationChannel,
  NotificationListData,
  NotificationPreferenceData,
  NotificationReadStatus,
  NotificationScope,
  NotificationType,
  ProviderTestResult
} from "@/apps/team-os/features/notification/types";
import {
  fetchIntegrations,
  fetchNotificationPreferences,
  fetchNotifications,
  markNotificationsRead,
  NotificationClientError,
  saveIntegration,
  saveNotificationPreferences,
  sendIntegrationTest
} from "@/apps/team-os/features/notification/services/notification-client";

function normalizeError(error: unknown) {
  return error instanceof NotificationClientError
    ? error
    : new NotificationClientError(error instanceof Error ? error.message : "消息数据加载失败，请稍后重试。");
}

function useSelectedCompany(initialCompanyId?: string) {
  const [companyId, setCompanyId] = React.useState(initialCompanyId);
  const initialRef = React.useRef(initialCompanyId);
  const currentRef = React.useRef(initialCompanyId);
  const versionRef = React.useRef(0);

  const setSelectedCompany = React.useCallback((nextCompanyId?: string) => {
    if (currentRef.current === nextCompanyId) return false;
    currentRef.current = nextCompanyId;
    versionRef.current += 1;
    setCompanyId(nextCompanyId);
    return true;
  }, []);

  React.useEffect(() => {
    if (initialRef.current === initialCompanyId) return;
    initialRef.current = initialCompanyId;
    setSelectedCompany(initialCompanyId);
  }, [initialCompanyId, setSelectedCompany]);

  return { companyId, setCompanyId: setSelectedCompany, currentRef, versionRef };
}

export function useNotificationCenter(initialCompanyId?: string) {
  const selectedCompany = useSelectedCompany(initialCompanyId);
  const { companyId, setCompanyId } = selectedCompany;
  const [scope, setScopeState] = React.useState<NotificationScope>("MINE");
  const [type, setTypeState] = React.useState<NotificationType | undefined>();
  const [readStatus, setReadStatusState] = React.useState<NotificationReadStatus | undefined>();
  const [page, setPage] = React.useState(1);
  const [data, setData] = React.useState<NotificationListData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<NotificationClientError | null>(null);
  const [readingId, setReadingId] = React.useState<string | null>(null);
  const [markingAll, setMarkingAll] = React.useState(false);
  const [actionMessage, setActionMessage] = React.useState<string | null>(null);
  const requestRef = React.useRef(0);
  const actionRef = React.useRef(0);
  const renderedCompanyRef = React.useRef(companyId);

  React.useEffect(() => {
    if (renderedCompanyRef.current === companyId) return;
    renderedCompanyRef.current = companyId;
    actionRef.current += 1;
    setReadingId(null);
    setMarkingAll(false);
    setActionMessage(null);
    setData(null);
    setLoading(true);
  }, [companyId]);

  const reload = React.useCallback(async () => {
    const requestId = ++requestRef.current;
    const companyVersion = selectedCompany.versionRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchNotifications({ companyId, scope, type, readStatus, page, pageSize: 10 });
      if (requestId === requestRef.current && companyVersion === selectedCompany.versionRef.current) {
        setData(result);
        setLoading(false);
        if (!companyId) setCompanyId(result.companyId);
      }
    } catch (caught) {
      if (requestId === requestRef.current && companyVersion === selectedCompany.versionRef.current) {
        setData(null);
        setError(normalizeError(caught));
      }
    } finally {
      if (requestId === requestRef.current && companyVersion === selectedCompany.versionRef.current) setLoading(false);
    }
  }, [companyId, page, readStatus, scope, selectedCompany.versionRef, setCompanyId, type]);

  React.useEffect(() => {
    void reload();
    return () => { requestRef.current += 1; };
  }, [reload]);

  const selectCompany = React.useCallback((nextCompanyId: string) => {
    if (nextCompanyId === selectedCompany.currentRef.current) return;
    requestRef.current += 1;
    actionRef.current += 1;
    setReadingId(null);
    setMarkingAll(false);
    setData(null);
    setLoading(true);
    setActionMessage(null);
    setPage(1);
    setScopeState("MINE");
    setCompanyId(nextCompanyId);
  }, [selectedCompany.currentRef, setCompanyId]);

  const setType = React.useCallback((nextType?: NotificationType) => {
    requestRef.current += 1;
    actionRef.current += 1;
    setReadingId(null);
    setMarkingAll(false);
    setActionMessage(null);
    setLoading(true);
    setPage(1);
    setTypeState(nextType);
  }, []);

  const setReadStatus = React.useCallback((nextStatus?: NotificationReadStatus) => {
    requestRef.current += 1;
    actionRef.current += 1;
    setReadingId(null);
    setMarkingAll(false);
    setActionMessage(null);
    setLoading(true);
    setPage(1);
    setReadStatusState(nextStatus);
  }, []);

  const setScope = React.useCallback((nextScope: NotificationScope) => {
    requestRef.current += 1;
    actionRef.current += 1;
    setReadingId(null);
    setMarkingAll(false);
    setActionMessage(null);
    setLoading(true);
    setPage(1);
    setScopeState(nextScope);
  }, []);

  const changePage = React.useCallback((nextPage: number) => {
    requestRef.current += 1;
    actionRef.current += 1;
    setReadingId(null);
    setMarkingAll(false);
    setActionMessage(null);
    setLoading(true);
    setPage(nextPage);
  }, []);

  const markRead = React.useCallback(async (notificationId: string) => {
    const activeCompanyId = data?.companyId ?? companyId;
    if (!activeCompanyId || readingId || scope !== "MINE") return;
    const actionId = ++actionRef.current;
    setReadingId(notificationId);
    setActionMessage(null);
    try {
      await markNotificationsRead({ companyId: activeCompanyId, notificationIds: [notificationId] });
      if (actionId !== actionRef.current || selectedCompany.currentRef.current !== activeCompanyId) return;
      setActionMessage("通知已标记为已读。");
      await reload();
    } catch (caught) {
      if (actionId === actionRef.current && selectedCompany.currentRef.current === activeCompanyId) {
        setError(normalizeError(caught));
      }
    } finally {
      if (actionId === actionRef.current) setReadingId(null);
    }
  }, [companyId, data?.companyId, readingId, reload, scope, selectedCompany.currentRef]);

  const markAllRead = React.useCallback(async () => {
    const activeCompanyId = data?.companyId ?? companyId;
    if (!activeCompanyId || markingAll || scope !== "MINE") return;
    const actionId = ++actionRef.current;
    setMarkingAll(true);
    setActionMessage(null);
    try {
      const result = await markNotificationsRead({ companyId: activeCompanyId, all: true });
      if (actionId !== actionRef.current || selectedCompany.currentRef.current !== activeCompanyId) return;
      setActionMessage(result.updatedCount > 0 ? `已将 ${result.updatedCount} 条通知标记为已读。` : "当前没有未读通知。");
      await reload();
    } catch (caught) {
      if (actionId === actionRef.current && selectedCompany.currentRef.current === activeCompanyId) {
        setError(normalizeError(caught));
      }
    } finally {
      if (actionId === actionRef.current) setMarkingAll(false);
    }
  }, [companyId, data?.companyId, markingAll, reload, scope, selectedCompany.currentRef]);

  return {
    companyId,
    data,
    loading,
    error,
    type,
    readStatus,
    scope,
    page,
    readingId,
    markingAll,
    actionMessage,
    selectCompany,
    setType,
    setReadStatus,
    setScope,
    setPage: changePage,
    markRead,
    markAllRead,
    reload
  };
}

export function useIntegrations(initialCompanyId?: string) {
  const selectedCompany = useSelectedCompany(initialCompanyId);
  const { companyId, setCompanyId } = selectedCompany;
  const [data, setData] = React.useState<IntegrationListData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<NotificationClientError | null>(null);
  const [savingProvider, setSavingProvider] = React.useState<IntegrationProvider | null>(null);
  const [testingProvider, setTestingProvider] = React.useState<IntegrationProvider | null>(null);
  const [testResults, setTestResults] = React.useState<Partial<Record<IntegrationProvider, ProviderTestResult>>>({});
  const [actionMessage, setActionMessage] = React.useState<string | null>(null);
  const requestRef = React.useRef(0);
  const actionRef = React.useRef(0);
  const renderedCompanyRef = React.useRef(companyId);

  React.useEffect(() => {
    if (renderedCompanyRef.current === companyId) return;
    renderedCompanyRef.current = companyId;
    actionRef.current += 1;
    setSavingProvider(null);
    setTestingProvider(null);
    setTestResults({});
    setActionMessage(null);
    setData(null);
    setLoading(true);
  }, [companyId]);

  const reload = React.useCallback(async () => {
    const requestId = ++requestRef.current;
    const companyVersion = selectedCompany.versionRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchIntegrations(companyId);
      if (requestId === requestRef.current && companyVersion === selectedCompany.versionRef.current) {
        setData(result);
        setLoading(false);
        if (!companyId) setCompanyId(result.companyId);
      }
    } catch (caught) {
      if (requestId === requestRef.current && companyVersion === selectedCompany.versionRef.current) {
        setData(null);
        setError(normalizeError(caught));
      }
    } finally {
      if (requestId === requestRef.current && companyVersion === selectedCompany.versionRef.current) setLoading(false);
    }
  }, [companyId, selectedCompany.versionRef, setCompanyId]);

  React.useEffect(() => {
    void reload();
    return () => { requestRef.current += 1; };
  }, [reload]);

  const selectCompany = React.useCallback((nextCompanyId: string) => {
    if (nextCompanyId === selectedCompany.currentRef.current) return;
    requestRef.current += 1;
    actionRef.current += 1;
    setSavingProvider(null);
    setTestingProvider(null);
    setData(null);
    setLoading(true);
    setTestResults({});
    setActionMessage(null);
    setCompanyId(nextCompanyId);
  }, [selectedCompany.currentRef, setCompanyId]);

  const save = React.useCallback(async (input: {
    provider: IntegrationProvider;
    enabled: boolean;
    config?: Record<string, string>;
  }) => {
    const activeCompanyId = data?.companyId ?? companyId;
    if (!activeCompanyId || savingProvider || testingProvider) return false;
    const actionId = ++actionRef.current;
    setSavingProvider(input.provider);
    setActionMessage(null);
    try {
      const result = await saveIntegration({ companyId: activeCompanyId, ...input });
      if (actionId !== actionRef.current || selectedCompany.currentRef.current !== activeCompanyId) return false;
      setData(result);
      setActionMessage("连接配置已安全保存，敏感凭据不会在页面回显。");
      return true;
    } catch (caught) {
      if (actionId === actionRef.current && selectedCompany.currentRef.current === activeCompanyId) {
        setError(normalizeError(caught));
      }
      return false;
    } finally {
      if (actionId === actionRef.current) setSavingProvider(null);
    }
  }, [companyId, data?.companyId, savingProvider, selectedCompany.currentRef, testingProvider]);

  const test = React.useCallback(async (provider: IntegrationProvider) => {
    const activeCompanyId = data?.companyId ?? companyId;
    if (!activeCompanyId || testingProvider || savingProvider) return;
    const actionId = ++actionRef.current;
    setTestingProvider(provider);
    setActionMessage(null);
    try {
      const result = await sendIntegrationTest({ companyId: activeCompanyId, provider });
      if (actionId !== actionRef.current || selectedCompany.currentRef.current !== activeCompanyId) return;
      setTestResults((current) => ({ ...current, [provider]: result }));
    } catch (caught) {
      if (actionId === actionRef.current && selectedCompany.currentRef.current === activeCompanyId) {
        setError(normalizeError(caught));
      }
    } finally {
      if (actionId === actionRef.current) setTestingProvider(null);
    }
  }, [companyId, data?.companyId, savingProvider, selectedCompany.currentRef, testingProvider]);

  return {
    companyId,
    data,
    loading,
    error,
    savingProvider,
    testingProvider,
    testResults,
    actionMessage,
    selectCompany,
    save,
    test,
    reload
  };
}

interface PreferencePageData {
  companyId: string;
  companies: NotificationPreferenceData["companies"];
  preferences: NotificationPreferenceData["preferences"];
}

export function useNotificationPreferences(initialCompanyId?: string) {
  const selectedCompany = useSelectedCompany(initialCompanyId);
  const { companyId, setCompanyId } = selectedCompany;
  const [data, setData] = React.useState<PreferencePageData | null>(null);
  const [draft, setDraft] = React.useState<Partial<Record<NotificationChannel, boolean>>>({});
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<NotificationClientError | null>(null);
  const [actionMessage, setActionMessage] = React.useState<string | null>(null);
  const requestRef = React.useRef(0);
  const actionRef = React.useRef(0);
  const renderedCompanyRef = React.useRef(companyId);

  React.useEffect(() => {
    if (renderedCompanyRef.current === companyId) return;
    renderedCompanyRef.current = companyId;
    actionRef.current += 1;
    setSaving(false);
    setActionMessage(null);
    setData(null);
    setDraft({});
    setLoading(true);
  }, [companyId]);

  const reload = React.useCallback(async () => {
    const requestId = ++requestRef.current;
    const companyVersion = selectedCompany.versionRef.current;
    setLoading(true);
    setError(null);
    try {
      const preferences = await fetchNotificationPreferences(companyId);
      if (requestId === requestRef.current && companyVersion === selectedCompany.versionRef.current) {
        const next = {
          companyId: preferences.companyId,
          companies: preferences.companies,
          preferences: preferences.preferences
        };
        setData(next);
        setDraft(Object.fromEntries(next.preferences.map((item) => [item.channel, item.enabled])));
        setLoading(false);
        if (!companyId) setCompanyId(preferences.companyId);
      }
    } catch (caught) {
      if (requestId === requestRef.current && companyVersion === selectedCompany.versionRef.current) {
        setData(null);
        setError(normalizeError(caught));
      }
    } finally {
      if (requestId === requestRef.current && companyVersion === selectedCompany.versionRef.current) setLoading(false);
    }
  }, [companyId, selectedCompany.versionRef, setCompanyId]);

  React.useEffect(() => {
    void reload();
    return () => { requestRef.current += 1; };
  }, [reload]);

  const selectCompany = React.useCallback((nextCompanyId: string) => {
    if (nextCompanyId === selectedCompany.currentRef.current) return;
    requestRef.current += 1;
    actionRef.current += 1;
    setSaving(false);
    setData(null);
    setDraft({});
    setLoading(true);
    setActionMessage(null);
    setCompanyId(nextCompanyId);
  }, [selectedCompany.currentRef, setCompanyId]);

  const toggle = React.useCallback((channel: NotificationChannel) => {
    setActionMessage(null);
    setDraft((current) => ({ ...current, [channel]: !(current[channel] ?? false) }));
  }, []);

  const save = React.useCallback(async () => {
    const activeCompanyId = data?.companyId ?? companyId;
    if (!activeCompanyId || !data || saving) return;
    const actionId = ++actionRef.current;
    setSaving(true);
    setActionMessage(null);
    try {
      const result = await saveNotificationPreferences({
        companyId: activeCompanyId,
        preferences: data.preferences.map((item) => ({
          channel: item.channel,
          enabled: draft[item.channel] ?? item.enabled
        }))
      });
      if (actionId !== actionRef.current || selectedCompany.currentRef.current !== activeCompanyId) return;
      setData((current) => current ? { ...current, preferences: result.preferences } : current);
      setDraft(Object.fromEntries(result.preferences.map((item) => [item.channel, item.enabled])));
      setActionMessage("通知渠道偏好已保存。");
    } catch (caught) {
      if (actionId === actionRef.current && selectedCompany.currentRef.current === activeCompanyId) {
        setError(normalizeError(caught));
      }
    } finally {
      if (actionId === actionRef.current) setSaving(false);
    }
  }, [companyId, data, draft, saving, selectedCompany.currentRef]);

  return {
    companyId,
    data,
    draft,
    loading,
    saving,
    error,
    actionMessage,
    selectCompany,
    toggle,
    save,
    reload
  };
}
