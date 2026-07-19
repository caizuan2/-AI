import assert from "node:assert/strict";
import {
  buildConversationFeatureFlagResponse,
  defaultConversationFeatureFlags,
  normalizeConversationFeatureFlags
} from "../lib/conversation-control/feature-flags";
import { buildConversationShareUrl } from "../lib/conversation-control/links";

const canonicalPartial = normalizeConversationFeatureFlags(
  { "conversation.share.enabled": true },
  { includeDefaults: false }
);

assert.deepEqual(canonicalPartial, { share: true });

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
  }
});

assert.equal(nestedFlags?.share, true);
assert.equal(nestedFlags?.groupChat, true);
assert.equal(nestedFlags?.rename, false);

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
