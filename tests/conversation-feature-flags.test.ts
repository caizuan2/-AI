import assert from "node:assert/strict";
import { ensureReactServerTestRuntime } from "./react-server-test-bootstrap";

ensureReactServerTestRuntime(import.meta.filename);

async function main() {
  const [featureFlagModule, linksModule] = await Promise.all([
    import("../lib/conversation-control/feature-flags"),
    import("../lib/conversation-control/links")
  ]);
  const {
    buildConversationFeatureFlagResponse,
    defaultConversationFeatureFlags,
    normalizeConversationFeatureFlags
  } = featureFlagModule;
  const { buildConversationShareUrl } = linksModule;

  const canonicalPartial = normalizeConversationFeatureFlags(
    { "conversation.share.enabled": true },
    { includeDefaults: false }
  );

  assert.deepEqual(canonicalPartial, { share: true });

  const explicitlyDisabledPartial = normalizeConversationFeatureFlags(
    { "conversation.share.enabled": false },
    { includeDefaults: false }
  );

  assert.deepEqual(explicitlyDisabledPartial, { share: false });

  const legacyPartial = normalizeConversationFeatureFlags(
    {
      share: {
        enabled: true
      },
      conversationShareEnabled: true
    },
    { includeDefaults: false }
  );

  assert.deepEqual(legacyPartial, { share: true });

  const nestedFlags = normalizeConversationFeatureFlags({
    after: {
      features: {
        "conversation.share.enabled": true,
        "conversation.group_chat.enabled": true
      }
    },
  });

  assert.equal(nestedFlags?.share, true);
  assert.equal(nestedFlags?.groupChat, true);
  assert.equal(nestedFlags?.rename, true);

  const response = buildConversationFeatureFlagResponse({
    ...defaultConversationFeatureFlags,
    share: true
  });

  assert.equal(response.share, true);
  assert.equal(response.features["conversation.share.enabled"], true);
  assert.equal(response.reasons?.share, undefined);

  const shareUrl = buildConversationShareUrl(
    new Request("http://47.238.0.23/api/user/conversations/demo/share", {
      headers: {
        host: "47.238.0.23"
      }
    }),
    "test-share-token-1234567890"
  );

  assert.equal(shareUrl, "http://47.238.0.23/api/public/conversation-shares/test-share-token-1234567890");

  console.log("conversation feature flag tests passed");
}

void main();
