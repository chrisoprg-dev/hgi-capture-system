import React, { useState, useEffect, useRef } from 'react';
import { usePipeline } from '../contexts/PipelineContext';
import { Btn } from './ui';
import { COLORS } from '../utils/constants';

const { BG, BG2, BG3, TEXT, TEXT_D, GOLD, BORDER } = COLORS;

function renderMarkdown(text) {
  return text.split('\n').map((line, i) => {
    if (line.startsWith('- ') || line.startsWith('• ')) {
      return React.createElement('div', { key: i, style: { marginBottom: 4, paddingLeft: 12 } }, line);
    }
    if (line.startsWith('**') && line.endsWith('**')) {
      return React.createElement('div', { key: i, style: { fontWeight: 600, marginBottom: 8, color: GOLD } }, line.slice(2, -2));
    }
    return React.createElement('div', { key: i, style: { marginBottom: line.trim() ? 8 : 4 } }, line || ' ');
  });
}

function Chat() {
  var pl = usePipeline();
  var msgState = useState([]);
  var messages = msgState[0];
  var setMessages = msgState[1];
  var inputState = useState('');
  var input = inputState[0];
  var setInput = inputState[1];
  var loadState = useState(false);
  var loading = loadState[0];
  var setLoading = loadState[1];
  var messagesEndRef = useRef(null);
  var toastState = useState(null);
  var toast = toastState[0];
  var setToast = toastState[1];
  var toastTimer = useRef(null);

  var showToast = function(msg) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(function() { setToast(null); }, 4000);
  };

  var scrollToBottom = function() {
    if (messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(function() { scrollToBottom(); }, [messages]);

  var sendMessage = async function() {
    if (!input.trim() || loading) return;
    var userMsg = input.trim();
    setInput('');
    setMessages(function(prev) { return prev.concat([{ role: 'user', content: userMsg }]); });
    setLoading(true);

    try {
      var sendR = await fetch('/api/chat-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg, history: messages.slice(-10), opp_id: pl && pl.selectedOppId ? pl.selectedOppId : null })
      });
      if (!sendR.ok) throw new Error('Send failed: ' + sendR.status);
      var sendD = await sendR.json();
      var response = sendD.response || 'No response';
      setMessages(function(prev) { return prev.concat([{ role: 'assistant', content: response }]); });
      if (sendD.memory_stored) {
        showToast('Saved to organism memory: ' + (sendD.memory_summary || 'insight captured'));
      }
    } catch(e) {
      setMessages(function(prev) { return prev.concat([{ role: 'assistant', content: 'Error: ' + e.message }]); });
    }
    setLoading(false);
  };

  var handleKeyDown = function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  var quickActions = [
    { label: 'Pipeline summary', msg: 'Give me a quick summary of our current pipeline — how many opportunities, top 3 by OPI, any urgent deadlines.' },
    { label: 'What should I focus on today?', msg: 'Based on the current pipeline, what should HGI focus on today? Consider deadlines, OPI scores, and stage.' },
    { label: 'Competitive landscape', msg: 'Who are our main competitors for the top opportunities in the pipeline? What are their strengths vs HGI?' },
    { label: 'System status', msg: 'What is the current system status? How many opportunities are being tracked, when was the last scraper run, any issues?' }
  ];

  return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' } },
    // Header
    React.createElement('div', { style: { marginBottom: 16 } },
      React.createElement('h2', { style: { color: GOLD, margin: 0, fontSize: 20, fontWeight: 800 } }, 'System Chat'),
      React.createElement('p', { style: { color: TEXT_D, margin: '4px 0 0', fontSize: 12 } }, 'Ask questions about the pipeline, opportunities, or HGI capabilities')
    ),

    // Quick actions (only show when no messages)
    messages.length === 0 ? React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 } },
      quickActions.map(function(qa) {
        return React.createElement('button', {
          key: qa.label,
          onClick: function() { setInput(qa.msg); },
          style: { padding: '10px 14px', background: BG2, border: '1px solid ' + BORDER, borderRadius: 6, color: TEXT_D, fontSize: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', lineHeight: 1.4 }
        },
          React.createElement('div', { style: { color: GOLD, fontWeight: 600, fontSize: 11, marginBottom: 4 } }, qa.label),
          React.createElement('div', { style: { fontSize: 11, color: TEXT_D } }, qa.msg.slice(0, 60) + '...')
        );
      })
    ) : null,

    // Messages area
    React.createElement('div', { style: { flex: 1, overflowY: 'auto', marginBottom: 16, padding: '0 4px' } },
      messages.map(function(m, i) {
        var isUser = m.role === 'user';
        return React.createElement('div', {
          key: i,
          style: { display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: 12 }
        },
          React.createElement('div', {
            style: {
              maxWidth: '80%',
              padding: '12px 16px',
              borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
              background: isUser ? GOLD + '22' : BG2,
              border: '1px solid ' + (isUser ? GOLD + '44' : BORDER),
              color: TEXT,
              fontSize: 13,
              lineHeight: 1.6
            }
          },
            isUser ? m.content : React.createElement('div', null, renderMarkdown(m.content))
          )
        );
      }),
      loading ? React.createElement('div', { style: { display: 'flex', justifyContent: 'flex-start', marginBottom: 12 } },
        React.createElement('div', { style: { padding: '12px 16px', borderRadius: '16px 16px 16px 4px', background: BG2, border: '1px solid ' + BORDER, color: GOLD, fontSize: 13, animation: 'pulse 1.2s infinite' } }, 'Thinking...')
      ) : null,
      React.createElement('div', { ref: messagesEndRef })
    ),

    // Input area
    React.createElement('div', { style: { display: 'flex', gap: 8, padding: '12px 0', borderTop: '1px solid ' + BORDER } },
      React.createElement('textarea', {
        value: input,
        onChange: function(e) { setInput(e.target.value); },
        onKeyDown: handleKeyDown,
        placeholder: 'Ask about the pipeline, opportunities, or HGI capabilities...',
        rows: 2,
        style: { flex: 1, background: BG3, border: '1px solid ' + BORDER, borderRadius: 8, color: TEXT, fontFamily: 'inherit', fontSize: 13, padding: '10px 14px', resize: 'none', outline: 'none', lineHeight: 1.5 }
      }),
      React.createElement(Btn, {
        onClick: sendMessage,
        disabled: loading || !input.trim(),
        style: { alignSelf: 'flex-end' }
      }, loading ? '...' : 'Send')
    )
  );
}

export default Chat;