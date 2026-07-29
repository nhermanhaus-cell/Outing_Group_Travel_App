import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import * as Contacts from 'expo-contacts';
import * as SMS from 'expo-sms';
import * as SecureStore from 'expo-secure-store';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../../src/lib/supabase';
import { useAuth, useTrips } from '../../../src/providers/AppProviders';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { Text } from '../../../components/ui/Text';
import { Button } from '../../../components/ui/Button';
import { ANALYTICS_EVENTS } from '@gayi/shared';
import { useAnalytics } from '../../../src/analytics/analytics-provider';

type Buddy = { id: string; firstName: string; displayName: string; phone: string };

export default function TripInviteScreen() {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const { getTrip } = useTrips();
  const { user } = useAuth();
  const { track } = useAnalytics();
  const trip = getTrip(tripId ?? '');
  const [contacts, setContacts] = useState<Buddy[]>([]);
  const [selected, setSelected] = useState<Buddy[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const draftKey = `gayi:pending-invites:${tripId}`;

  useEffect(() => { setHydrated(false); void SecureStore.getItemAsync(draftKey).then((value) => { if (value) { try { setSelected(JSON.parse(value)); } catch { /* ignore */ } } setHydrated(true); }); }, [draftKey]);
  useEffect(() => { if (hydrated) void SecureStore.setItemAsync(draftKey, JSON.stringify(selected)); }, [draftKey, hydrated, selected]);

  const requestContacts = async () => {
    const permission = await Contacts.requestPermissionsAsync();
    if (!permission.granted) return;
    const result = await Contacts.getContactsAsync({ fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.FirstName], sort: Contacts.SortTypes.FirstName });
    setContacts(result.data.flatMap((contact) => {
      const phone = contact.phoneNumbers?.find((item) => item.number)?.number;
      if (!phone) return [];
      return [{ id: contact.id, firstName: contact.firstName ?? contact.name.split(' ')[0] ?? 'friend', displayName: contact.name, phone }];
    }));
  };

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const source = contacts.length ? contacts : selected;
    return source.filter((contact) => !needle || contact.displayName.toLowerCase().includes(needle) || contact.phone.includes(needle));
  }, [contacts, query, selected]);

  const sendQueue = async () => {
    if (!trip || !supabase || selected.length === 0) return;
    setLoading(true);
    try {
      for (const buddy of selected) {
        const { data, error } = await supabase.functions.invoke('trip-invites', { body: { operation: 'create', tripId: trip.tripId } });
        if (error || !data?.inviteUrl) continue;
        const destination = trip.destinationName ? `a trip to ${trip.destinationName}` : 'our next trip';
        const message = `Hey ${buddy.firstName} — I’m plotting ${destination}, and it won’t be the same without you. Join me on Outing so we can compare ideas and build the dream itinerary together: ${data.inviteUrl}`;
        if (await SMS.isAvailableAsync()) {
          await SMS.sendSMSAsync([buddy.phone], message);
          track(ANALYTICS_EVENTS.INVITE_SENT, { channel: 'sms_handoff' });
        }
      }
      await SecureStore.deleteItemAsync(draftKey);
      setSelected([]);
      router.back();
    } finally { setLoading(false); }
  };

  if (!trip) return null;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <View style={{ padding: spacing.base, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}><Pressable onPress={() => router.back()}><Text style={{ fontSize: 22, color: colors.textSecondary }}>←</Text></Pressable><View style={{ flex: 1 }}><Text variant="h2">Add travel buddies</Text><Text variant="caption" style={{ color: colors.textSecondary }}>Phone numbers stay in this encrypted local draft and are never uploaded.</Text></View></View>
      {contacts.length === 0 && selected.length === 0 ? (
        <View style={{ padding: spacing['2xl'], gap: spacing.md }}><Text variant="bodyLg" style={{ color: colors.textSecondary }}>Choose people from your contacts, then review each personalized message in the native SMS composer before sending.</Text><Button size="lg" onPress={requestContacts}>Choose from contacts</Button><Button variant="ghost" onPress={() => router.back()}>I’ll add them later</Button></View>
      ) : (
        <>
          <View style={{ margin: spacing.base, gap: spacing.sm }}><TextInput value={query} onChangeText={setQuery} placeholder="Search contacts…" placeholderTextColor={colors.textTertiary} style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundSecondary, borderRadius: radius.md, padding: spacing.md, color: colors.textPrimary }} />{contacts.length === 0 ? <Button size="sm" variant="secondary" onPress={requestContacts}>Add more contacts</Button> : null}</View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.base, gap: spacing.xs, paddingBottom: 120 }}>
            {visible.map((contact) => {
              const active = selected.some((item) => item.id === contact.id);
              return <Pressable key={contact.id} onPress={() => setSelected((current) => active ? current.filter((item) => item.id !== contact.id) : [...current, contact])} style={{ flexDirection: 'row', justifyContent: 'space-between', padding: spacing.md, borderRadius: radius.md, backgroundColor: active ? colors.accentLight : colors.cardBackground }}><View><Text variant="labelLg">{contact.displayName}</Text><Text variant="caption" style={{ color: colors.textTertiary }}>{contact.phone}</Text></View><Text style={{ color: active ? colors.accent : colors.textTertiary }}>{active ? '✓' : '○'}</Text></Pressable>;
            })}
          </ScrollView>
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.base, paddingBottom: insets.bottom + spacing.sm, backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border }}>{!user ? <View style={{ gap: spacing.sm }}><Text variant="caption" style={{ color: colors.textSecondary, textAlign: 'center' }}>The trip and contact draft are saved. Sign in to create secure invite links.</Text><Button size="lg" fullWidth onPress={() => router.push({ pathname: '/auth/login', params: { returnTo: `/trips/${trip.tripId}/invite` } })}>Sign in to send invites</Button></View> : trip.localOnly ? <Button size="lg" fullWidth disabled>Syncing trip…</Button> : <Button size="lg" fullWidth loading={loading} disabled={selected.length === 0} onPress={sendQueue}>Review {selected.length || ''} invite{selected.length === 1 ? '' : 's'} in Messages</Button>}</View>
        </>
      )}
    </View>
  );
}
