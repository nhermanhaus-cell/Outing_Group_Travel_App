import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { posthog } from '../config/posthog';
import { supabase } from '../lib/supabase';
import { useAuth } from './AppProviders';
import {
  mergeSavedDestinationSlugs,
  normalizeSavedDestinationSlugs,
} from '../lib/savedDestinationsState';

const STORAGE_KEY = 'outing:saved-destinations:v1';

interface SavedDestinationsContextValue {
  slugs: string[];
  loading: boolean;
  isSaved: (slug: string) => boolean;
  toggleSaved: (slug: string, source?: 'user' | 'quiz' | 'assistant' | 'trip') => Promise<void>;
}

const SavedDestinationsContext = createContext<SavedDestinationsContextValue | null>(null);

export function SavedDestinationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [slugs, setSlugs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (!active) return;
      try {
        setSlugs(normalizeSavedDestinationSlugs(raw ? JSON.parse(raw) : []));
      } catch {
        setSlugs([]);
      }
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!user || !supabase || loading) return;
    let active = true;
    void (async () => {
      if (slugs.length > 0) {
        await supabase.from('saved_destinations').upsert(
          slugs.map((destinationSlug) => ({
            user_id: user.id,
            destination_slug: destinationSlug,
            source: 'user',
          })),
          { onConflict: 'user_id,destination_slug' },
        );
      }
      const { data } = await supabase
        .from('saved_destinations')
        .select('destination_slug')
        .eq('user_id', user.id);
      if (!active || !data) return;
      const merged = mergeSavedDestinationSlugs(
        slugs,
        data.map((row) => row.destination_slug),
      );
      setSlugs(merged);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    })();
    return () => { active = false; };
    // Sync once per authenticated identity; toggles write through separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, loading]);

  const toggleSaved = useCallback(async (
    slug: string,
    source: 'user' | 'quiz' | 'assistant' | 'trip' = 'user',
  ) => {
    const willSave = !slugs.includes(slug);
    const next = willSave ? [...slugs, slug] : slugs.filter((value) => value !== slug);
    setSlugs(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    posthog.capture(willSave ? 'destination_saved' : 'destination_unsaved', {
      destination_slug: slug,
      source,
    });
    if (user && supabase) {
      if (willSave) {
        await supabase.from('saved_destinations').upsert({
          user_id: user.id,
          destination_slug: slug,
          source,
        }, { onConflict: 'user_id,destination_slug' });
      } else {
        await supabase
          .from('saved_destinations')
          .delete()
          .eq('user_id', user.id)
          .eq('destination_slug', slug);
      }
    }
  }, [slugs, user]);

  const value = useMemo<SavedDestinationsContextValue>(() => ({
    slugs,
    loading,
    isSaved: (slug) => slugs.includes(slug),
    toggleSaved,
  }), [loading, slugs, toggleSaved]);

  return (
    <SavedDestinationsContext.Provider value={value}>
      {children}
    </SavedDestinationsContext.Provider>
  );
}

export function useSavedDestinations(): SavedDestinationsContextValue {
  const context = useContext(SavedDestinationsContext);
  if (!context) throw new Error('useSavedDestinations must be used within AppProviders');
  return context;
}
