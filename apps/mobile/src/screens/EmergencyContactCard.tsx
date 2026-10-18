import { useEffect, useState } from "react";
import { View } from "react-native";
import { loadEmergency, saveContact, type EmergencyContact } from "../emergency";
import { space } from "../theme";
import { Body, Button, Card, ErrorText, Field, Heading, InfoRow, Small } from "../ui";

/**
 * Someone she picks (a parent, a roommate). Her friends can call or text them from their own
 * phones. BathroomBestie never calls anyone; the automatic text is a demo only.
 */
export function EmergencyContactCard({ contractId }: { contractId: string }) {
  const [contact, setContact] = useState<EmergencyContact | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  // Changing it opens the form; the saved contact stays in place until the new one is saved.
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!contractId) return;
    void loadEmergency(contractId)
      .then((r) => setContact(r.contact))
      .catch(() => undefined);
  }, [contractId]);

  const run = async (how: () => Promise<EmergencyContact | null>) => {
    setError(null);
    setBusy(true);
    try {
      setContact(await how());
      setEditing(false);
    } catch (e) {
      setError(
        String(e).includes(": 400")
          ? "Check the number (digits, spaces, + and - are fine)."
          : "Couldn't save. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (contact && !editing)
    return (
      <Card>
        <Heading>Emergency contact</Heading>
        <View style={{ gap: space.sm }}>
          <InfoRow label="Name" value={contact.name} />
          <InfoRow label="Phone" value={contact.phone} />
        </View>
        <Small>
          Your friends can see this tonight and call or text them if they need to. BathroomBestie
          never calls anyone.
        </Small>
        <Button
          tone="quiet"
          title="Change contact"
          onPress={() => {
            setName(contact.name);
            setPhone(contact.phone);
            setEditing(true);
          }}
        />
      </Card>
    );
  return (
    <Card>
      <View style={{ gap: space.xs }}>
        <Heading>Emergency contact</Heading>
        <Body muted>Someone you trust, in case your friends can't be reached.</Body>
      </View>
      <Field label="Name" value={name} onChangeText={setName} placeholder="Mom, Dad, roommate…" />
      <Field
        label="Phone"
        value={phone}
        onChangeText={setPhone}
        placeholder="Their number…"
        keyboardType="phone-pad"
      />
      <Button
        tone="secondary"
        title={busy ? "Saving…" : "Save contact"}
        disabled={busy || !name.trim() || !phone.trim()}
        onPress={() =>
          void run(async () => (await saveContact(contractId, { name, phone })).contact)
        }
      />
      {error && <ErrorText>{error}</ErrorText>}
    </Card>
  );
}
