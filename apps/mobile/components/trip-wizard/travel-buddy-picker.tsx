import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import * as Contacts from 'expo-contacts';
import * as SecureStore from 'expo-secure-store';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Button } from '../ui/Button';
import { Text } from '../ui/Text';

export type TravelBuddy = { id: string; firstName: string; displayName: string; phone: string };
export const QUIZ_BUDDY_DRAFT_KEY = 'gayi:quiz-travel-buddies';

export function TravelBuddyPicker({ draftKey, autoRequest = false, onSelectionChange }: { draftKey: string; autoRequest?: boolean; onSelectionChange?: (selected: TravelBuddy[]) => void }) {
  const { colors, spacing, radius } = useTheme();
  const [contacts, setContacts] = useState<TravelBuddy[]>([]);
  const [selected, setSelected] = useState<TravelBuddy[]>([]);
  const [query, setQuery] = useState('');
  const [denied, setDenied] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const requested = useRef(false);

  useEffect(() => { setHydrated(false); void SecureStore.getItemAsync(draftKey).then((raw) => { if (raw) { try { const saved = JSON.parse(raw) as TravelBuddy[]; setSelected(saved); onSelectionChange?.(saved); } catch { /* ignore obsolete draft */ } } setHydrated(true); }); }, [draftKey, onSelectionChange]);
  useEffect(() => { if (!hydrated) return; void SecureStore.setItemAsync(draftKey, JSON.stringify(selected)); onSelectionChange?.(selected); }, [draftKey, hydrated, onSelectionChange, selected]);

  const requestContacts = useCallback(async () => {
    requested.current = true;
    const permission = await Contacts.requestPermissionsAsync();
    if (!permission.granted) { setDenied(true); return; }
    const result = await Contacts.getContactsAsync({ fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.FirstName], sort: Contacts.SortTypes.FirstName });
    setContacts(result.data.flatMap((contact) => {
      const phone = contact.phoneNumbers?.find((item) => item.number)?.number;
      if (!phone) return [];
      return [{ id: contact.id, firstName: contact.firstName ?? contact.name.split(' ')[0] ?? 'friend', displayName: contact.name, phone }];
    }));
  }, []);

  useEffect(() => { if (autoRequest && !requested.current) void requestContacts(); }, [autoRequest, requestContacts]);

  const visible = useMemo(() => { const needle = query.trim().toLowerCase(); return contacts.filter((contact) => !needle || contact.displayName.toLowerCase().includes(needle) || contact.phone.includes(needle)).slice(0, 50); }, [contacts, query]);

  if (denied) return <View style={{ gap: spacing.sm }}><Text variant="bodySm" style={{ color: colors.textSecondary }}>Contact access was not granted. You can continue and invite people later.</Text><Button variant="secondary" onPress={requestContacts}>Try contacts again</Button></View>;
  if (contacts.length === 0) return <View style={{ gap: spacing.sm }}><Text variant="bodySm" style={{ color: colors.textSecondary }}>{selected.length ? `${selected.length} ${selected.length === 1 ? 'buddy' : 'buddies'} selected.` : 'Choose contacts now; phone numbers stay only in this encrypted draft until you send.'}</Text><Button variant="secondary" onPress={requestContacts}>Choose from contacts</Button></View>;

  return <View style={{ gap: spacing.sm }}>
    <TextInput value={query} onChangeText={setQuery} placeholder="Search contacts…" placeholderTextColor={colors.textTertiary} style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundSecondary, borderRadius: radius.md, padding: spacing.md, color: colors.textPrimary }} />
    {visible.map((contact) => { const active = selected.some((item) => item.id === contact.id); return <Pressable key={contact.id} onPress={() => setSelected((current) => active ? current.filter((item) => item.id !== contact.id) : [...current, contact])} style={{ flexDirection: 'row', justifyContent: 'space-between', padding: spacing.md, borderRadius: radius.md, backgroundColor: active ? colors.accentLight : colors.cardBackground }}><View style={{ flex: 1 }}><Text variant="labelLg">{contact.displayName}</Text><Text variant="caption" style={{ color: colors.textTertiary }}>{contact.phone}</Text></View><Text style={{ color: active ? colors.accent : colors.textTertiary }}>{active ? '✓' : '○'}</Text></Pressable>; })}
    <Text variant="caption" style={{ color: colors.textTertiary }}>{selected.length} selected</Text>
  </View>;
}
