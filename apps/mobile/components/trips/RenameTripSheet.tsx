import React, { useEffect, useState } from 'react';
import { Modal, TextInput, View } from 'react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';

export function RenameTripSheet({ visible, currentName, onDismiss, onSave }: { visible: boolean; currentName: string; onDismiss: () => void; onSave: (name: string) => Promise<void> }) {
  const { colors, spacing, radius } = useTheme();
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (visible) setName(currentName); }, [currentName, visible]);
  return <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onDismiss}>
    <View style={{ flex: 1, backgroundColor: colors.background, padding: spacing.xl, gap: spacing.lg, justifyContent: 'center' }}>
      <View style={{ gap: spacing.xs }}><Text variant="displaySm">Rename trip</Text><Text variant="bodyMd" style={{ color: colors.textSecondary }}>Give everyone a title they’ll recognize.</Text></View>
      <TextInput value={name} onChangeText={setName} autoFocus selectTextOnFocus returnKeyType="done" placeholder="Trip name" placeholderTextColor={colors.textTertiary} style={{ backgroundColor: colors.backgroundSecondary, borderWidth: 1.5, borderColor: name.trim() ? colors.accent : colors.border, borderRadius: radius.md, padding: spacing.md, color: colors.textPrimary, fontSize: 18 }} />
      <Button size="lg" fullWidth loading={saving} disabled={!name.trim()} onPress={async () => { setSaving(true); try { await onSave(name.trim()); onDismiss(); } finally { setSaving(false); } }}>Save name</Button>
      <Button variant="ghost" fullWidth onPress={onDismiss}>Cancel</Button>
    </View>
  </Modal>;
}
