

import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  ScrollView,
  RefreshControl,
  TextInput,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';

type AdminRole = 'owner' | 'admin' | 'moderator';

type Report = {
  id: string;
  target_type: string;
  target_id: string;
  target_user_id: string | null;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
};

type ManagedMember = {
  id: string;
  full_name: string | null;
  username: string | null;
  role: 'owner' | 'admin' | 'moderator' | 'member';
};

type DashboardData = {
  role: AdminRole;
  stats?: {
    members: number;
    posts: number;
    groups: number;
    reports: number;
  };
  reports: Report[];
  reportsCount?: number;
};

const statLabels = [
  { key: 'members', label: 'Membres', icon: '👥' },
  { key: 'posts', label: 'Publications', icon: '📝' },
  { key: 'groups', label: 'Groupes', icon: '🌐' },
  { key: 'reports', label: 'Signalements', icon: '🚩' },
] as const;

const statusLabels: Record<string, string> = {
  pending: 'En attente',
  reviewing: 'En cours d’examen',
  actioned: 'Signalement confirmé',
  dismissed: 'Signalement rejeté',
};

export default function AdminScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [busyReportId, setBusyReportId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [members, setMembers] = useState<ManagedMember[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [membersLoading, setMembersLoading] = useState(false);
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  const [memberMessage, setMemberMessage] = useState('');

  const loadDashboard = useCallback(async () => {
    try {
      setErrorMessage('');

      const { data: result, error } =
        await supabase.functions.invoke('admin-dashboard');

      if (error) throw error;

      if (
        !result ||
        !['owner', 'admin', 'moderator'].includes(result.role)
      ) {
        router.replace('/home');
        return;
      }

      setData(result as DashboardData);
    } catch (error) {
      console.log('Erreur dashboard :', error);
      setErrorMessage(
        'Impossible de charger le tableau de bord. Vérifie ta connexion.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const onRefresh = () => {
    setRefreshing(true);
    loadDashboard();
  };

  const handleReportAction = async (
    reportId: string,
    status: 'reviewing' | 'actioned' | 'dismissed'
  ) => {
    if (busyReportId) return;

    setBusyReportId(reportId);
    setErrorMessage('');
    setActionMessage('');

    try {
      const { data: result, error } =
        await supabase.functions.invoke('admin-report-action', {
          body: {
            reportId,
            status,
            note: notes[reportId] || '',
          },
        });

      if (error) throw error;
      if (!result?.success) {
        throw new Error(
          result?.error || 'La modification du signalement a échoué.'
        );
      }

      setActionMessage('Signalement mis à jour avec succès.');
      await loadDashboard();
    } catch (error: any) {
      console.log('Erreur modération :', error);
      setErrorMessage(
        error?.message || 'Impossible de traiter ce signalement.'
      );
    } finally {
      setBusyReportId(null);
    }
  };

  const loadMembers = useCallback(async (search = '') => {
    setMembersLoading(true);
    setMemberMessage('');
    try {
      const { data: result, error } =
        await supabase.functions.invoke('admin-manage-members', {
          body: { action: 'list', search },
        });
      if (error) throw error;
      if (!result || !Array.isArray(result.members)) {
        throw new Error(result?.error || 'Réponse invalide du serveur.');
      }
      setMembers(result.members as ManagedMember[]);
    } catch (error: any) {
      setMemberMessage(error?.message || 'Impossible de charger les membres.');
    } finally {
      setMembersLoading(false);
    }
  }, []);

  const changeMemberRole = (member: ManagedMember, role: 'admin' | 'moderator' | 'member') => {
    const actionLabel = role === 'member'
      ? 'retirer ses droits administratifs'
      : role === 'admin' ? 'le promouvoir administrateur' : 'le nommer modérateur';

    Alert.alert(
      'Confirmer la modification',
      `Veux-tu vraiment ${actionLabel} : ${member.full_name || member.username || 'ce membre'} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          style: role === 'member' ? 'destructive' : 'default',
          onPress: async () => {
            if (busyMemberId) return;
            setBusyMemberId(member.id);
            setMemberMessage('');
            try {
              const { data: result, error } =
                await supabase.functions.invoke('admin-manage-members', {
                  body: { action: 'set_role', userId: member.id, role },
                });
              if (error) throw error;
              if (!result?.success) {
                throw new Error(result?.error || 'Modification impossible.');
              }
              setMemberMessage(result.message || 'Rôle modifié.');
              await loadMembers(memberSearch);
            } catch (error: any) {
              setMemberMessage(error?.message || 'Modification du rôle impossible.');
            } finally {
              setBusyMemberId(null);
            }
          },
        },
      ]
    );
  };

  useEffect(() => {
    if (data?.role === 'owner') loadMembers();
  }, [data?.role, loadMembers]);

  const isModerator = data?.role === 'moderator';

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#B99AFF" />
        <Text style={styles.muted}>Chargement sécurisé...</Text>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>FreindZone</Text>
        <Text style={styles.muted}>
          {errorMessage || 'Accès au tableau de bord impossible.'}
        </Text>
        <Pressable style={styles.button} onPress={loadDashboard}>
          <Text style={styles.buttonText}>Réessayer</Text>
        </Pressable>
        <Pressable onPress={() => router.replace('/home')}>
          <Text style={styles.backText}>Retour à l’accueil</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#B99AFF"
        />
      }
    >
      <Pressable onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>‹ Retour</Text>
      </Pressable>

      <Text style={styles.brand}>FreindZone</Text>
      <Text style={styles.signature}>BY ELHAAG</Text>

      <View style={styles.headerCard}>
        <Text style={styles.icon}>{isModerator ? '🛡️' : '👑'}</Text>
        <Text style={styles.title}>
          {isModerator ? 'Espace modération' : 'Administration'}
        </Text>
        <Text style={styles.role}>
          RÔLE : {data.role.toUpperCase()}
        </Text>
        <Text style={styles.muted}>
          Accès vérifié par le serveur FreindZone.
        </Text>
      </View>

      {data.role === 'owner' && (
        <View style={styles.card}>
          <Text style={styles.section}>GESTION DES MEMBRES</Text>
          <Text style={styles.muted}>
            Recherche un membre pour lui attribuer ou retirer un rôle.
          </Text>

          <TextInput
            style={styles.memberSearch}
            placeholder="Nom ou nom d'utilisateur..."
            placeholderTextColor="#929BB0"
            value={memberSearch}
            onChangeText={setMemberSearch}
            maxLength={60}
          />

          <Pressable
            style={styles.button}
            onPress={() => loadMembers(memberSearch)}
            disabled={membersLoading || !!busyMemberId}
          >
            <Text style={styles.buttonText}>
              {membersLoading ? 'Recherche...' : 'Rechercher les membres'}
            </Text>
          </Pressable>

          {memberMessage ? (
            <Text style={styles.memberMessage}>{memberMessage}</Text>
          ) : null}

          {membersLoading ? (
            <ActivityIndicator color="#B99AFF" style={{ marginTop: 15 }} />
          ) : members.length === 0 ? (
            <Text style={styles.muted}>Aucun membre trouvé.</Text>
          ) : (
            members.map((member) => (
              <View key={member.id} style={styles.memberItem}>
                <Text style={styles.memberName}>
                  {member.full_name || member.username || 'Membre sans nom'}
                </Text>
                {member.username ? (
                  <Text style={styles.reportText}>@{member.username}</Text>
                ) : null}
                <Text style={styles.memberRole}>
                  Rôle actuel : {member.role.toUpperCase()}
                </Text>

                {member.role !== 'owner' && (
                  <View style={styles.actionRow}>
                    <Pressable
                      style={[styles.memberAction, styles.reviewButton]}
                      disabled={!!busyMemberId}
                      onPress={() => changeMemberRole(member, 'admin')}
                    >
                      <Text style={styles.buttonText}>Admin</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.memberAction, styles.confirmButton]}
                      disabled={!!busyMemberId}
                      onPress={() => changeMemberRole(member, 'moderator')}
                    >
                      <Text style={styles.buttonText}>Modérateur</Text>
                    </Pressable>
                    {member.role !== 'member' && (
                      <Pressable
                        style={[styles.memberAction, styles.rejectButton]}
                        disabled={!!busyMemberId}
                        onPress={() => changeMemberRole(member, 'member')}
                      >
                        <Text style={styles.buttonText}>Retirer</Text>
                      </Pressable>
                    )}
                  </View>
                )}
                {busyMemberId === member.id ? (
                  <ActivityIndicator color="#B99AFF" style={{ marginTop: 10 }} />
                ) : null}
              </View>
            ))
          )}
        </View>
      )}

      {!isModerator && data.stats && (
        <>
          <Text style={styles.section}>VUE GÉNÉRALE</Text>

          <View style={styles.statsGrid}>
            {statLabels.map((item) => (
              <View key={item.key} style={styles.statCard}>
                <Text style={styles.statIcon}>{item.icon}</Text>
                <Text style={styles.statNumber}>
                  {data.stats?.[item.key] ?? 0}
                </Text>
                <Text style={styles.statLabel}>{item.label}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      <Text style={styles.section}>
        {isModerator ? 'SIGNALEMENTS À EXAMINER' : 'DERNIERS SIGNALEMENTS'}
      </Text>

      <View style={styles.card}>
        <Text style={styles.itemTitle}>
          {data.reportsCount ?? data.stats?.reports ?? 0} signalement(s)
        </Text>
        <Text style={styles.muted}>
          {isModerator
            ? 'Tu as accès uniquement à la modération des signalements.'
            : 'Voici les signalements récemment enregistrés.'}
        </Text>
      </View>

      {data.reports.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.muted}>Aucun signalement pour le moment.</Text>
        </View>
      ) : (
        data.reports.map((report) => {
          const isBusy = busyReportId === report.id;
          const isFinal =
            report.status === 'actioned' ||
            report.status === 'dismissed';

          return (
            <View key={report.id} style={styles.reportCard}>
              <Text style={styles.reportTitle}>
                {report.reason || 'Motif non précisé'}
              </Text>

              <Text style={styles.reportText}>
                Cible : {report.target_type}
              </Text>

              <Text style={styles.reportText}>
                Statut : {statusLabels[report.status] || report.status}
              </Text>

              {report.details ? (
                <Text style={styles.reportText}>
                  Détails : {report.details}
                </Text>
              ) : null}

              <Text style={styles.reportDate}>
                {new Date(report.created_at).toLocaleString('fr-FR')}
              </Text>

              {!isFinal && (
                <>
                  <Text style={styles.noteLabel}>
                    Note de modération (facultative)
                  </Text>

                  <TextInput
                    style={styles.noteInput}
                    placeholder="Ajouter une note..."
                    placeholderTextColor="#929BB0"
                    value={notes[report.id] || ''}
                    onChangeText={(value) =>
                      setNotes((previous) => ({
                        ...previous,
                        [report.id]: value,
                      }))
                    }
                    multiline
                    maxLength={1000}
                    editable={!isBusy && !busyReportId}
                  />

                  {report.status === 'pending' && (
                    <Pressable
                      style={[
                        styles.actionButton,
                        styles.reviewButton,
                        (isBusy || !!busyReportId) && styles.disabledButton,
                      ]}
                      disabled={!!busyReportId}
                      onPress={() =>
                        handleReportAction(report.id, 'reviewing')
                      }
                    >
                      {isBusy ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <Text style={styles.buttonText}>Examiner</Text>
                      )}
                    </Pressable>
                  )}

                  <View style={styles.actionRow}>
                    <Pressable
                      style={[
                        styles.actionButton,
                        styles.confirmButton,
                        (isBusy || !!busyReportId) && styles.disabledButton,
                      ]}
                      disabled={!!busyReportId}
                      onPress={() =>
                        handleReportAction(report.id, 'actioned')
                      }
                    >
                      <Text style={styles.buttonText}>Confirmer</Text>
                    </Pressable>

                    <Pressable
                      style={[
                        styles.actionButton,
                        styles.rejectButton,
                        (isBusy || !!busyReportId) && styles.disabledButton,
                      ]}
                      disabled={!!busyReportId}
                      onPress={() =>
                        handleReportAction(report.id, 'dismissed')
                      }
                    >
                      <Text style={styles.buttonText}>Rejeter</Text>
                    </Pressable>
                  </View>
                </>
              )}

              {isFinal && (
                <Text style={styles.finalStatus}>
                  Ce signalement a déjà été traité.
                </Text>
              )}
            </View>
          );
        })
      )}

      {actionMessage ? (
        <Text style={styles.success}>{actionMessage}</Text>
      ) : null}

      {errorMessage ? (
        <Text style={styles.error}>{errorMessage}</Text>
      ) : null}

      <Pressable
        style={styles.button}
        onPress={onRefresh}
        disabled={refreshing || !!busyReportId}
      >
        <Text style={styles.buttonText}>Actualiser</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#080B14',
  },
  content: {
    padding: 22,
    paddingTop: 60,
    paddingBottom: 24,
  },
  center: {
    flex: 1,
    backgroundColor: '#080B14',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 25,
    gap: 15,
  },
  back: {
    marginBottom: 25,
  },
  backText: {
    color: '#B99AFF',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 15,
  },
  brand: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '900',
    textAlign: 'center',
  },
  signature: {
    color: '#B99AFF',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 4,
    textAlign: 'center',
    marginBottom: 30,
  },
  headerCard: {
    backgroundColor: '#141A29',
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: '#34304F',
    marginBottom: 28,
    alignItems: 'center',
  },
  icon: {
    fontSize: 35,
    marginBottom: 10,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
  },
  role: {
    color: '#B99AFF',
    fontSize: 12,
    fontWeight: '900',
    marginVertical: 12,
  },
  muted: {
    color: '#929BB0',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  section: {
    color: '#B99AFF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 14,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 25,
  },
  statCard: {
    width: '48%',
    backgroundColor: '#141A29',
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#34304F',
    padding: 17,
    marginBottom: 12,
    alignItems: 'center',
  },
  statIcon: {
    fontSize: 25,
    marginBottom: 8,
  },
  statNumber: {
    color: '#FFFFFF',
    fontSize: 27,
    fontWeight: '900',
  },
  statLabel: {
    color: '#929BB0',
    fontSize: 12,
    marginTop: 5,
  },
  card: {
    backgroundColor: '#141A29',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#34304F',
    marginBottom: 14,
  },
  itemTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
  },
  reportCard: {
    backgroundColor: '#141A29',
    borderRadius: 16,
    padding: 17,
    borderWidth: 1,
    borderColor: '#34304F',
    marginBottom: 12,
  },
  reportTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 10,
  },
  reportText: {
    color: '#C2C8D6',
    fontSize: 13,
    marginBottom: 6,
    lineHeight: 19,
  },
  reportDate: {
    color: '#929BB0',
    fontSize: 11,
    marginTop: 8,
  },
  noteLabel: {
    color: '#B99AFF',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 18,
    marginBottom: 8,
  },
  noteInput: {
    backgroundColor: '#080B14',
    borderWidth: 1,
    borderColor: '#34304F',
    borderRadius: 12,
    color: '#FFFFFF',
    padding: 12,
    minHeight: 75,
    textAlignVertical: 'top',
    marginBottom: 10,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  actionButton: {
    flex: 1,
    padding: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  reviewButton: {
    backgroundColor: '#5865A8',
  },
  confirmButton: {
    backgroundColor: '#238B65',
  },
  rejectButton: {
    backgroundColor: '#A84454',
  },
  disabledButton: {
    opacity: 0.45,
  },
  finalStatus: {
    color: '#929BB0',
    fontSize: 12,
    marginTop: 15,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#7C5CFF',
    padding: 15,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 15,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  memberSearch: {
    backgroundColor: '#080B14',
    borderWidth: 1,
    borderColor: '#34304F',
    borderRadius: 12,
    color: '#FFFFFF',
    padding: 13,
    marginTop: 15,
  },
  memberItem: {
    backgroundColor: '#080B14',
    borderRadius: 12,
    padding: 13,
    marginTop: 13,
    borderWidth: 1,
    borderColor: '#34304F',
  },
  memberName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  memberRole: {
    color: '#B99AFF',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 8,
  },
  memberAction: {
    flex: 1,
    padding: 10,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  memberMessage: {
    color: '#B99AFF',
    fontSize: 12,
    marginTop: 12,
  },
  success: {
    color: '#63D9A5',
    textAlign: 'center',
    marginTop: 15,
  },
  error: {
    color: '#FF8A8A',
    textAlign: 'center',
    marginTop: 15,
  },
});
