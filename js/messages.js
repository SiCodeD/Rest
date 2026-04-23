// Messaging Logic with Supabase Real-time
const Messages = {
    activeConversationId: null,
    realtimeChannel: null,

    send: async function(recipientId, content) {
        const user = Auth.getCurrentUser();
        if (!user) return null;

        try {
            const { data, error } = await supabase
                .from('messages')
                .insert([{
                    sender_id: user.id,
                    recipient_id: recipientId,
                    content: content,
                    school_id: user.schoolId || user.school_id
                }])
                .select()
                .single();

            if (error) throw error;

            // إرسال إشعار للمستلم (إذا كان نظام الإشعارات متوفراً)
            if (window.Notifications && Notifications.db) {
                Notifications.db.send(recipientId, 'New Message', `You received a new message from ${user.name}`);
            }
            
            return data;
        } catch (error) {
            console.error('Error sending message:', error.message);
            Notifications.error('Error', 'Failed to send message');
            return null;
        }
    },

    getParticipants: async function() {
        const currentUser = Auth.getCurrentUser();
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .neq('id', currentUser.id)
                .eq('school_id', currentUser.schoolId || currentUser.school_id);
            
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error fetching participants:', error.message);
            return [];
        }
    },

    getInbox: async function() {
        const user = Auth.getCurrentUser();
        if (!user) return [];
        
        try {
            const { data, error } = await supabase
                .from('messages')
                .select('*, sender:profiles!sender_id(full_name), recipient:profiles!recipient_id(full_name)')
                .or(`recipient_id.eq.${user.id},sender_id.eq.${user.id}`)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error fetching inbox:', error.message);
            return [];
        }
    },

    getConversationMessages: async function(otherPartyId) {
        const user = Auth.getCurrentUser();
        try {
            const { data, error } = await supabase
                .from('messages')
                .select('*')
                .or(`and(sender_id.eq.${user.id},recipient_id.eq.${otherPartyId}),and(sender_id.eq.${otherPartyId},recipient_id.eq.${user.id})`)
                .order('created_at', { ascending: true });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error fetching conversation:', error.message);
            return [];
        }
    },

    openConversation: async function(otherPartyId) {
        this.activeConversationId = otherPartyId;
        const user = Auth.getCurrentUser();
        
        try {
            // Get other party profile
            const { data: otherParty } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', otherPartyId)
                .single();

            const messages = await this.getConversationMessages(otherPartyId);

            const placeholder = document.getElementById('conversationPlaceholder');
            const panel = document.getElementById('conversationPanel');
            const title = document.getElementById('conversationTitle');
            const subtitle = document.getElementById('conversationSubtitle');
            const messagesContainer = document.getElementById('conversationMessages');

            if (!panel || !messagesContainer || !otherParty) return;

            placeholder.classList.add('hidden');
            panel.classList.remove('hidden');
            title.textContent = otherParty.full_name;
            subtitle.textContent = otherParty.email || `${otherParty.role} account`;
            messagesContainer.innerHTML = '';

            messages.forEach(message => {
                const isOwn = message.sender_id === user.id;
                const bubble = `
                    <div class="flex ${isOwn ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div class="max-w-md px-4 py-3 rounded-2xl ${isOwn ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100' : 'bg-white border border-slate-100 text-slate-700 shadow-sm'}">
                            <p class="text-sm leading-relaxed">${Security.sanitize(message.content)}</p>
                            <p class="text-[10px] mt-2 ${isOwn ? 'text-emerald-100' : 'text-slate-400'}">${new Date(message.created_at).toLocaleTimeString()}</p>
                        </div>
                    </div>
                `;
                messagesContainer.insertAdjacentHTML('beforeend', bubble);
            });

            messagesContainer.scrollTop = messagesContainer.scrollHeight;

            // Subscribe to real-time messages for this conversation
            this.subscribeToConversation(otherPartyId);

        } catch (error) {
            console.error('Error opening conversation:', error.message);
        }
    },

    subscribeToConversation: function(otherPartyId) {
        const user = Auth.getCurrentUser();
        
        // Clean up old channel
        if (this.realtimeChannel) {
            supabase.removeChannel(this.realtimeChannel);
        }

        this.realtimeChannel = supabase
            .channel('chat_room')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    filter: `recipient_id=eq.${user.id}`
                },
                (payload) => {
                    if (payload.new.sender_id === otherPartyId) {
                        this.appendMessage(payload.new, false);
                    }
                }
            )
            .subscribe();
    },

    appendMessage: function(message, isOwn) {
        const container = document.getElementById('conversationMessages');
        if (!container) return;

        const bubble = `
            <div class="flex ${isOwn ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div class="max-w-md px-4 py-3 rounded-2xl ${isOwn ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100' : 'bg-white border border-slate-100 text-slate-700 shadow-sm'}">
                    <p class="text-sm leading-relaxed">${Security.sanitize(message.content)}</p>
                    <p class="text-[10px] mt-2 ${isOwn ? 'text-emerald-100' : 'text-slate-400'}">${new Date(message.created_at).toLocaleTimeString()}</p>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', bubble);
        container.scrollTop = container.scrollHeight;
    },

    renderInbox: async function(searchTerm = '') {
        const container = document.getElementById('messageInboxList');
        if (!container) return;

        const messages = await this.getInbox();
        const currentUser = Auth.getCurrentUser();
        container.innerHTML = '';

        const conversations = {};
        messages.forEach(message => {
            const otherPartyId = message.sender_id === currentUser.id ? message.recipient_id : message.sender_id;
            if (!conversations[otherPartyId]) {
                const otherPartyName = message.sender_id === currentUser.id 
                    ? (message.recipient ? message.recipient.full_name : 'User')
                    : (message.sender ? message.sender.full_name : 'User');

                conversations[otherPartyId] = {
                    id: otherPartyId,
                    name: otherPartyName,
                    lastMessage: message
                };
            }
        });

        const filtered = Object.values(conversations).filter(conversation =>
            conversation.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            conversation.lastMessage.content.toLowerCase().includes(searchTerm.toLowerCase())
        );

        if (!filtered.length) {
            container.innerHTML = '<p class="text-sm text-slate-400 text-center py-10">No conversations found</p>';
            return;
        }

        filtered.forEach(conversation => {
            const isActive = conversation.id === this.activeConversationId;
            const item = `
                <button data-conversation-id="${conversation.id}" class="w-full p-4 border-b border-slate-50 hover:bg-slate-50 transition-all text-left ${isActive ? 'bg-emerald-50/60 border-l-4 border-l-emerald-600' : ''}">
                    <div class="flex justify-between items-start mb-1">
                        <h4 class="font-bold text-sm">${Security.sanitize(conversation.name)}</h4>
                        <span class="text-[10px] text-slate-400">${new Date(conversation.lastMessage.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                    <p class="text-xs text-slate-500 truncate">${Security.sanitize(conversation.lastMessage.content)}</p>
                </button>
            `;
            container.insertAdjacentHTML('beforeend', item);
        });
    },

    renderRecipientOptions: async function() {
        const select = document.getElementById('messageRecipient');
        if (!select) return;

        select.innerHTML = '<option value="">Loading recipients...</option>';
        const participants = await this.getParticipants();
        
        select.innerHTML = '<option value="">Select recipient...</option>' + 
            participants.map(user => `<option value="${user.id}">${user.full_name} (${user.role})</option>`).join('');
    },

    bindEvents: function() {
        const composeBtn = document.getElementById('composeMessageBtn');
        const closeBtn = document.getElementById('closeComposeModal');
        const composeModal = document.getElementById('composeMessageModal');
        const composeForm = document.getElementById('composeMessageForm');
        const replyForm = document.getElementById('messageReplyForm');
        const searchInput = document.getElementById('messageSearchInput');

        if (composeBtn) {
            composeBtn.addEventListener('click', async () => {
                await this.renderRecipientOptions();
                composeModal.classList.remove('hidden');
            });
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                composeModal.classList.add('hidden');
            });
        }

        if (composeForm) {
            composeForm.addEventListener('submit', async event => {
                event.preventDefault();
                const recipientId = document.getElementById('messageRecipient').value;
                const content = document.getElementById('composeMessageInput').value.trim();
                if (!recipientId || !content) return;

                const msg = await this.send(recipientId, content);
                if (msg) {
                    composeForm.reset();
                    composeModal.classList.add('hidden');
                    await this.renderInbox();
                    await this.openConversation(recipientId);
                }
            });
        }

        if (replyForm) {
            replyForm.addEventListener('submit', async event => {
                event.preventDefault();
                if (!this.activeConversationId) return;

                const input = document.getElementById('replyMessageInput');
                const content = input.value.trim();
                if (!content) return;

                const msg = await this.send(this.activeConversationId, content);
                if (msg) {
                    this.appendMessage(msg, true);
                    input.value = '';
                    await this.renderInbox(searchInput ? searchInput.value : '');
                }
            });
        }

        document.addEventListener('click', async event => {
            const button = event.target.closest('[data-conversation-id]');
            if (!button) return;
            const otherPartyId = button.dataset.conversationId;
            await this.openConversation(otherPartyId);
            await this.renderInbox(searchInput ? searchInput.value : '');
        });

        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.renderInbox(e.target.value);
            });
        }
    },

    init: async function() {
        Auth.checkAuth();
        this.bindEvents();
        await this.renderInbox();
    }
};

document.addEventListener('DOMContentLoaded', () => Messages.init());
