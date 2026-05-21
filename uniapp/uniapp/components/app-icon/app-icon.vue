<template>
	<view class="app-icon" :style="{ fontSize: size + 'px', color: color }">
		{{ getIcon() }}
	</view>
</template>

<script>
export default {
	name: 'AppIcon',
	props: {
		type: {
			type: String,
			default: 'default'
		},
		size: {
			type: [Number, String],
			default: 24
		},
		color: {
			type: String,
			default: '#000000'
		}
	},
	data() {
		return {
			icons: {
				// 箭头类
				'back': '←',
				'backfill': '←',
				'forward': '→',
				'arrowright': '›',
				'arrowup': '↑',
				'down': '↓',
				'up': '↑',
				
				// 操作类
				'more': '⋯',
				'settings': '⚙',
				'gear': '⚙',
				'compose': '✎',
				'trash': '🗑',
				'trash-filled': '🗑',
				'close': '✕',
				'clear': '✕',
				'check': '✓',
				'checkmarkempty': '✓',
				'closeempty': '✕',
				
				// 状态类
				'info': 'ℹ',
				'infofill': 'ℹ',
				'eye': '👁',
				
				// 通信类
				'chat': '💬',
				'chatboxes': '💬',
				'chat-filled': '💬',
				'chatbox': '💬',
				'chatbox-filled': '💬',
				'paperplane': '➤',
				'paperplane-filled': '➤',
				'staff': '👤',
				'reload': '↻',
				'refresh': '↻',
				
				// 时间类
				'calendar': '📅',
				'calendar-filled': '📅',
				
				// 搜索类
				'search': '🔍',
				
				// 默认
				'default': '●'
			}
		}
	},
	methods: {
		getIcon() {
			return this.icons[this.type] || this.icons['default']
		}
	}
}
</script>

<style scoped>
.app-icon {
	display: inline-flex;
	align-items: center;
	justify-content: center;
}
</style>
