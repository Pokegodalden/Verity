import { Conversation } from '@elevenlabs/client';

const agentId = 'agent_1401m72ee364enevxjv4cxv9cdc3';

window.startVerityConversation = options => Conversation.startSession({
  ...options,
  agentId,
  connectionType: 'websocket',
});
