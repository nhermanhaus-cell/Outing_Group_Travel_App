import { useLocalSearchParams } from 'expo-router';
import { ImportReviewScreen } from '../../components/inspiration/import-review-screen';

export default function InspirationReviewRoute() {
  const { importId } = useLocalSearchParams<{ importId: string }>();
  return <ImportReviewScreen importId={importId} />;
}
