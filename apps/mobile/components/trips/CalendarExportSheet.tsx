import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Pressable, ScrollView, Switch, View } from 'react-native';
import type { ItineraryItem } from '@gayi/domain';
import type * as ExpoCalendar from 'expo-calendar';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import {
  calendarAccountLabel,
  exportItineraryToCalendar,
  getWritableEventCalendars,
  type CalendarTripContext,
} from '../../src/lib/calendarExport';

interface Props {
  visible: boolean;
  itinerary: ItineraryItem[];
  trip: CalendarTripContext;
  onClose: () => void;
}

export function CalendarExportSheet({ visible, itinerary, trip, onClose }: Props) {
  const { colors, spacing, radius } = useTheme();
  const [calendars, setCalendars] = useState<ExpoCalendar.Calendar[]>([]);
  const [calendarId, setCalendarId] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [includeTravel, setIncludeTravel] = useState(true);
  const [includeDowntime, setIncludeDowntime] = useState(true);

  const datedStops = useMemo(() => itinerary.filter((item) => item.startsAt || trip.startDate), [itinerary, trip.startDate]);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setLoading(true);
    setPermissionDenied(false);
    void getWritableEventCalendars()
      .then((next) => {
        if (!active) return;
        setCalendars(next);
        setCalendarId((current) => current && next.some((calendar) => calendar.id === current)
          ? current
          : next.find((calendar) => calendar.isPrimary)?.id ?? next[0]?.id);
      })
      .catch((error) => {
        if (!active) return;
        setPermissionDenied(error instanceof Error && error.message === 'CALENDAR_PERMISSION_DENIED');
        setCalendars([]);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [visible]);

  const exportAll = async () => {
    if (!calendarId) return;
    setExporting(true);
    try {
      const result = await exportItineraryToCalendar(calendarId, itinerary, trip, { includeTravel, includeDowntime });
      Alert.alert(
        'Calendar updated',
        `${result.created} event${result.created === 1 ? '' : 's'} added${result.updated ? ` and ${result.updated} updated` : ''}.${result.skipped ? ` ${result.skipped} undated or hidden blocks were skipped.` : ''}`,
        [{ text: 'Done', onPress: onClose }],
      );
    } catch (error) {
      Alert.alert('Couldn’t update calendar', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
        <Pressable onPress={(event) => event.stopPropagation()} style={{ maxHeight: '86%', backgroundColor: colors.background, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.xl, gap: spacing.md }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1, gap: spacing.xxs }}>
              <Text variant="h2">Add itinerary to calendar</Text>
              <Text variant="bodySm" style={{ color: colors.textSecondary }}>Choose any writable Apple, iCloud, Google, or device calendar.</Text>
            </View>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close calendar export"><Text style={{ fontSize: 22, color: colors.textSecondary }}>×</Text></Pressable>
          </View>

          {loading ? (
            <View style={{ paddingVertical: spacing['2xl'], alignItems: 'center', gap: spacing.sm }}><ActivityIndicator color={colors.accent} /><Text variant="bodySm" style={{ color: colors.textSecondary }}>Loading your calendars…</Text></View>
          ) : permissionDenied ? (
            <View style={{ gap: spacing.md, paddingVertical: spacing.lg }}>
              <Text variant="bodyMd" style={{ color: colors.textSecondary }}>Calendar access is off. Outing only uses it when you choose to add itinerary events.</Text>
              <Button variant="secondary" onPress={() => void Linking.openSettings()}>Open settings</Button>
            </View>
          ) : calendars.length === 0 ? (
            <Text variant="bodyMd" style={{ color: colors.textSecondary, paddingVertical: spacing.lg }}>No writable calendars are available. Add an iCloud or Google account in your phone’s calendar settings first.</Text>
          ) : (
            <>
              <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={{ gap: spacing.xs }}>
                {calendars.map((calendar) => {
                  const selected = calendar.id === calendarId;
                  return (
                    <Pressable key={calendar.id} onPress={() => setCalendarId(calendar.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? colors.accentLight : colors.cardBackground }}>
                      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: calendar.color || colors.accent }} />
                      <Text variant="labelMd" style={{ flex: 1 }}>{calendarAccountLabel(calendar)}</Text>
                      <Text style={{ color: selected ? colors.accent : colors.textTertiary }}>{selected ? '✓' : ''}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <View style={{ gap: spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}><Text variant="labelMd">Include travel blocks</Text><Text variant="caption" style={{ color: colors.textTertiary }}>Adds route time before scheduled stops.</Text></View>
                  <Switch value={includeTravel} onValueChange={setIncludeTravel} trackColor={{ true: colors.accent }} />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}><Text variant="labelMd">Include protected free time</Text><Text variant="caption" style={{ color: colors.textTertiary }}>Keeps downtime visible on your calendar.</Text></View>
                  <Switch value={includeDowntime} onValueChange={setIncludeDowntime} trackColor={{ true: colors.accent }} />
                </View>
              </View>

              <Text variant="caption" style={{ color: colors.textTertiary }}>{datedStops.length} dated itinerary blocks are ready. Re-exporting updates matching Outing events instead of duplicating them.</Text>
              <Button disabled={!calendarId || datedStops.length === 0 || exporting} onPress={() => void exportAll()}>{exporting ? 'Updating calendar…' : 'Add itinerary'}</Button>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
