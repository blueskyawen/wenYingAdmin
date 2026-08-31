<template>
	<view>
		<view class="uni-header">
			<view class="uni-group">
				<view class="uni-title"></view>
			</view>
			<view class="uni-group">
				<input class="uni-search" type="text" v-model="query" @confirm="search" placeholder="请输入搜索内容" />
				<button class="uni-button" type="default" size="mini" @click="search">搜索</button>
				<download-excel class="hide-on-phone" :fields="exportExcel.fields" :data="exportExcelData"
					:type="exportExcel.type" :name="exportExcel.filename">
					<button class="uni-button" type="primary" size="mini">导出 Excel</button>
				</download-excel>
			</view>
		</view>
		<view class="uni-container">
			<unicloud-db ref="udb" :collection="collectionList" :where="where" page-data="replace" :orderby="orderby"
				:getcount="true" :page-size="options.pageSize" :page-current="options.pageCurrent"
				v-slot:default="{ pagination, loading, error, options }" :options="options" loadtime="manual"
				@load="onqueryload">
				<uni-table ref="table" :loading="loading" :emptyText="error.message || '没有更多数据'" border stripe>
					<uni-tr>
						<uni-th align="center" sortable @sort-change="sortChange($event, 'thumbnail')">封面大图
						</uni-th>
						<uni-th align="center" filter-type="search" @filter-change="filterChange($event, 'title')" sortable
							@sort-change="sortChange($event, 'title')">标题
						</uni-th>
						<uni-th align="center" filter-type="search" @filter-change="filterChange($event, 'excerpt')"
							sortable @sort-change="sortChange($event, 'excerpt')">摘要
						</uni-th>
						<uni-th align="center" sortable @sort-change="sortChange($event, 'user_id')">作者</uni-th>
						<uni-th align="center" filter-type="select" :filter-data="options.filterData.categories"
							@filter-change="filterChange($event, 'category_id._id')">分类
						</uni-th>
						<uni-th align="center" filter-type="timestamp" @filter-change="filterChange($event, 'create_date')"
							sortable @sort-change="sortChange($event, 'create_date')">创建时间
						</uni-th>
						<uni-th align="center" filter-type="timestamp" @filter-change="filterChange($event, 'review_date')"
							sortable @sort-change="sortChange($event, 'review_date')">送审时间
						</uni-th>
						<uni-th align="center">操作</uni-th>
					</uni-tr>
					<uni-tr v-for="(item, index) in tableList" :key="index">
						<uni-td align="center" v-if="item.thumbnail && item.thumbnail.length > 0">
							<image :src="item.thumbnail[0]" mode="aspectFill"
								style="width: 120px; height: 80px; cursor:pointer;border-radius: 4px;" @click="previewCover(item.thumbnail)">
							</image>
						</uni-td>
						<uni-td align="center" v-else>无封面</uni-td>
						<uni-td align="center">{{ item.title }}</uni-td>
						<uni-td align="center">{{ item.excerpt }}</uni-td>
						<uni-td align="center">{{ item.user_id && item.user_id[0] && item.user_id[0].nickname || '-'}}</uni-td>
						<uni-td align="center">{{ item.category_id && item.category_id[0] && item.category_id[0].text || '-'}}</uni-td>
						<uni-td align="center">
							<uni-dateformat :threshold="[0, 0]" :date="item.create_date"></uni-dateformat>
						</uni-td>
						<uni-td align="center">
							<uni-dateformat :threshold="[0, 0]" :date="item.review_date"></uni-dateformat>
						</uni-td>
						<uni-td align="center">
							<view class="uni-group">
								<button v-if="hasPermission('UPDATE_UNI_CMS_ARTICLE')" @click="viewArticle(item)"
									class="uni-button" size="mini" type="default">预览</button>
								<button v-if="hasPermission('UPDATE_UNI_CMS_ARTICLE') && item.article_status == 2" @click="reviewAcceptArticle(item)"
									class="uni-button" size="mini" type="default">审核通过</button>
								<button v-if="hasPermission('UPDATE_UNI_CMS_ARTICLE') && item.article_status == 2" @click="reviewReject(item._id)"
									class="uni-button" size="mini" type="default">审核拒绝</button>
								<button v-if="hasPermission('UPDATE_UNI_CMS_ARTICLE') && item.article_status == 3" @click="acceptDeleteArticle(item)"
									class="uni-button" size="mini" type="default">删除审核</button>
							</view>
						</uni-td>
					</uni-tr>
				</uni-table>
				<view class="uni-pagination-box">
					<uni-pagination show-icon :page-size="pagination.size" v-model="pagination.current"
						:total="pagination.count" @change="onPageChanged" />
				</view>
			</unicloud-db>
		</view>
		<uni-drawer ref="popupView" mode="right" :mask-click="true" :width="420">
			<view class="scroll-view">
				<scroll-view class="scroll-view-box" scroll-y="true">
					<view class="title">
						<text>{{ viewData.title }}</text></view>
					<view class="desc">
						<text>{{ viewData.excerpt }}</text>
					</view>
					<rich-text class="content" :nodes="viewData.content"></rich-text>
				</scroll-view>
			</view>
		</uni-drawer>
		<uni-popup ref="popupReject" type="dialog">
			<uni-popup-dialog mode="input" type="error" title="审核不通过" 
				:duration="2000" :before-close="true" @close="closeReject" @confirm="confirmReject">
				<uni-easyinput type="textarea" autoHeight v-model="rejectReason" placeholder="不通过的原因"></uni-easyinput>
			</uni-popup-dialog>
		</uni-popup>
		<view style="display: none;" id="testEditor"></view>
	</view>
</template>

<script>
	// #ifdef VUE3
	import '@/uni_modules/uni-cms/common/quill.min.js'
	import '@/uni_modules/uni-cms/common/quill-image-resize.js'
	// #endif
	// #ifndef VUE3
	import Quill from '@/uni_modules/uni-cms/common/quill.min.js'
	import QuillImageResize from '@/uni_modules/uni-cms/common/quill-image-resize.js'
	// #endif
	import { filterToWhere } from '@/uni_modules/uni-cms/common/validator/uni-cms-articles.js';
	import authMixin from "@/uni_modules/uni-cms/common/auth-mixin";
	import {parseImageUrl} from "@/uni_modules/uni-cms/common/parse-image-url";
	// 实例化数据库
	const db = uniCloud.database()
	// 文章表
	const articleDBName = 'opendb-news-articles'
	// 分类表
	const categoryDBName = 'uni-cms-categories'
	// 用户表
	const userDBName = 'uni-id-users'
	
	// 表查询配置
	const dbOrderBy = '' // 排序字段
	const dbSearchFields = ['title', 'excerpt']
	// 分页配置
	const pageSize = 20
	const pageCurrent = 1
	
	// 排序方式映射
	const orderByMapping = {
		"ascending": "asc",
		"descending": "desc"
	}
	
	export default {
		mixins: [authMixin],
		data() {
			return {
				collectionList: [
					db.collection(articleDBName).field('_id,user_id,category_id,title,content,excerpt,article_status,avatar,avatarFile,create_date,review_date,last_modify_date,relate_cms_id,publish_ip,last_modify_ip').getTemp(),
					db.collection(categoryDBName).field('name as text, _id').getTemp(),
					db.collection(userDBName).field('nickname, _id').getTemp(),
				],
				query: '',
				orderby: dbOrderBy,
				orderByFieldName: "",
				options: {
					pageSize,
					pageCurrent,
					filterData: {
						"article_status_localdata": [
							{
								"value": 0,
								"text": "草稿箱"
							},
							{
								"value": 1,
								"text": "已发布"
							},
							{
								"value": 2,
								"text": "待审核"
							}
						],
						categories: []
					},
					article_status_valuetotext: {
					    "0": "草稿箱",
					    "1": "已发布",
						"2": "待审核",
					},
				},
				exportExcel: {
					"filename": "open-news-articles.xls",
					"type": "xls",
					"fields": {
						"用户ID": "user_id",
						"分类": "category_id",
						"标题": "title",
						"文章内容": "content",
						"文章摘录": "excerpt",
						"文章状态": "article_status",
						"封面大图": "avatar",
						"创建时间": "create_date",
						"发表时间": "review_date",
						"送审时间": "publish_date",
						"发布文章时IP地址": "publish_ip",
						"最后修改时间": "last_modify_date",
						"最后修改人IP": "last_modify_ip"
					}
				},
				exportExcelData: [],
				tableList: [],
				imageStyles: {
					width: 64,
					height: 64
				},
				selectedIndexs: [],
				baseWhere: '(article_status == 2 || article_status == 3)',
				searchwhere: '',
				filterwhere: '',
				viewData: {},
				rejectReason: '',
				rejectId: '',
				quill: null
			}
		},
		onLoad() {
			this._filter = {}
		},
		onReady() {
			this.$refs.udb.loadData();
			this.loadCategories();
			this.init();
		},
		computed: {
			where() {
				let searchStr = this.searchwhere ? ` && (${this.searchwhere})` : '';
				let filterStr = this.filterwhere ? ` && (${this.filterwhere})` : '';
				return this.baseWhere + searchStr + filterStr;
			}
		},
		methods: {
			init() {
				this.quill = new Quill('#testEditor')
			},
			async loadCategories () {
			  const {result} = await db.collection(categoryDBName).get()
			
			  if (result) {
				this.options.filterData.categories = result.data.map(item => {
				  return {
					text: item.name,
					value: item._id
				  }
				})
			  }
			},
			getWhere() {
				const query = this.query.trim()
				if (!query) {
					return ''
				}
				const queryRe = new RegExp(query, 'i')
				return dbSearchFields.map(name => queryRe + '.test(' + name + ')').join(' || ')
			},
			async onqueryload(data) {
				let listData = []
			
				for (const item of data) {
					if (item.avatar && typeof item.avatar === 'string') {
						item.thumbnail = [item.avatar]
					}
			
					const parseImages = await parseImageUrl(item.thumbnail)
					item.thumbnail = parseImages.map(image => image.src)
			
					listData.push(item)
				}
			
				this.tableList = listData
				this.exportExcelData = listData
			},
			previewCover(imageList) {
				uni.previewImage({
					current: imageList[0],
					urls: imageList
				})
			},
			search() {
				const newWhere = this.getWhere();
				this.searchwhere = newWhere;
				this.$nextTick(() => {
					this.loadData()
				})
			},
			// 加载数据
			loadData(clear = true) {
				this.$refs.udb.loadData({
					clear
				})
			},
			// 分页改变
			onPageChanged(e) {
				this.selectedIndexs.length = 0
				this.$refs.table.clearSelection()
				this.$refs.udb.loadData({
					current: e.current
				})
			},
			sortChange(e, name) {
				// 设置排序字段
				this.orderByFieldName = name;
				// 判断是否需要排序
				if (e.order) {
					// 设置排序方式
					this.orderby = name + ' ' + orderByMapping[e.order]
				} else {
					this.orderby = ''
				}
				// 清空选中项
				this.$refs.table.clearSelection()
				// 加载数据
				this.$nextTick(() => {
					this.$refs.udb.loadData()
				})
			
			},
			filterChange(e, name) {
				// 将筛选条件添加到筛选对象中
				this._filter[name] = {
					type: e.filterType,
					value: e.filter
				}
				  // range 类型的筛选，如果输入的值不是数字，则不进行筛选
				  const {type, value} = this._filter[name]
				  if (type === 'range') {
					for (const val of value) {
					  if (typeof val === "number" && isNaN(val)) return
					}
				  }
			
				// 将筛选对象转换为where条件
				let newWhere = filterToWhere(this._filter, db.command)
				// 判断是否有where条件
				if (Object.keys(newWhere).length) {
					// 如果有where条件，则将where条件赋值给this.where
					this.filterwhere = newWhere
				} else {
					// 如果没有where条件，则将this.where赋值为空字符串
					this.filterwhere = ''
				}
				// 加载数据
				this.$nextTick(() => {
					this.$refs.udb.loadData()
				})
			},
			viewArticle(item) {
				this.viewData = {...item}
				this.$refs.popupView.open();
			},
			close() {
				this.$refs.popupView.close();
				this.viewData = {}
			},
			htmlToDelta(value) {
				const parser = new DOMParser();
				const doc = parser.parseFromString(value, 'text/html');
				const delta = { ops: [] };
				let currentIndex = 0; // 用于处理嵌套结构，例如列表项等。
				let node = doc.body;
				if (node.nodeType === Node.ELEMENT_NODE) { // 元素节点
				  if (node.tagName === 'P') { // 段落处理示例
				    delta.ops.push({ insert: '\n' }); // 段落结束符，可根据需要调整
				  } else if (node.tagName === 'B') { // 加粗处理示例
				    delta.ops.push({ attributes: { bold: true } }); // 开始加粗属性
				    walk(node.firstChild); // 递归处理子节点
				    delta.ops.push({ attributes: { bold: false } }); // 结束加粗属性
				  } else { // 其他标签处理（根据需要添加）
				    console.warn('Unsupported tag:', node.tagName);
				  }
				} else if (node.nodeType === Node.TEXT_NODE) { // 文本节点
				  delta.ops.push({ insert: node.textContent }); // 直接插入文本内容
				} else if (node.nodeType === Node.ELEMENT_NODE) { // 处理可能的注释或特殊节点（如果有）
				  console.warn('Unsupported node type:', node.nodeType);
				}
				return delta;
			},
			reviewAcceptArticle(item) {
				uni.showModal({
					title: '审核通过',
					content: '文章审核通过后将会在前台展示',
					success: (res) => {
						if (res.confirm && item.user_id[0] && item.category_id[0]) {
							let deltaContent = null;
							if (this.quill) {
								this.quill.clipboard.dangerouslyPasteHTML(0, item.content);
								deltaContent = this.quill.getContents();
							} else {
								deltaContent = this.htmlToDelta(item.content);
							}
							let formData = {
								"user_id": item.user_id[0]._id,
								"category_id": item.category_id[0]._id,
								"title": item.title,
								"content": deltaContent,
								"contentHtml": item.content,
								"excerpt": item.excerpt,
								"article_status": 1,
								"last_modify_ip": item.last_modify_ip,
								"last_modify_date": item.last_modify_date,
								"publish_ip": item.publish_ip,
								"thumbnail": item.thumbnail ? item.thumbnail : [{}],
								"publish_date": Date.now(),
								"source": 2
							}
							db.collection('uni-cms-articles').add(formData).then(res => {
								db.collection(articleDBName).doc(item._id).update({
									"article_status": 1,
									"relate_cms_id": res.result.id,
									"publish_date": Date.now()
								}).then(res => {
									this.$refs.table.clearSelection();
									this.$refs.udb.loadData();
									uni.showToast({
										title: '发布成功',
										icon: "none"
									});
								})
							}).catch((err) => {
								uni.showModal({
									content: err.message || '请求服务失败',
									showCancel: false
								})
							});
						}
					}
				})
			},
			acceptDeleteArticle(item) {
				uni.showModal({
					title: '删除审核',
					content: '删除已发布文章将会删除个人库和公开库的数据',
					success: (res) => {
						if (res.confirm) {
							this.procAcceptDelete(item);
						}
					}
				})
			},
			async procAcceptDelete(item) {
				const collection = db.collection('uni-cms-articles')
				if (item.relate_cms_id) {
					await collection.doc(item.relate_cms_id).remove()
				}
				await db.collection(articleDBName).doc(item._id).remove();
				uni.showToast({
					title: '操作成功',
					icon: "none"
				});
				this.$refs.table.clearSelection();
				this.$refs.udb.loadData();
			},
			reviewReject(id) {
				this.rejectId = id;
				this.$refs.popupReject.open();
			},
			closeReject() {
				this.$refs.popupReject.close();
			},
			confirmReject(e) {
				let reasonValue = this.rejectReason;
				db.collection(articleDBName).doc(this.rejectId).update({
					"article_status": 0,
					"reviewRejectReason": reasonValue || "审核不通过"
				}).then(res => {
					this.$refs.table.clearSelection();
					this.$refs.udb.loadData();
					this.$refs.popupReject.close();
					uni.showToast({
						title: '操作成功',
						icon: "none"
					});
				})
			},
			navigateTo(url, clear) {
				// clear 表示刷新列表时是否清除页码，true 表示刷新并回到列表第 1 页，默认为 true
				uni.navigateTo({
					url,
					events: {
						refreshData: () => {
							this.loadData(clear)
						}
					}
				})
			},
		}
	}
</script>

<style lang="scss" scoped>
	.scroll-view {
		flex: 1;
		width: 420px;
		height: 100%;
		background-color: #fff;
		.scroll-view-box {
			flex: 1;
			position: absolute;
			top: 0;
			right: 0;
			bottom: 0;
			left: 0;
			padding: 15px;
			box-sizing: border-box;
		}
		.title {
			text {
			  font-size: 40rpx;
			  line-height: 66rpx;
			  font-weight: bold;
			  color: #333;
			}
		}
		.desc {
			margin-top: 15rpx;
			text {
			  font-size: 26rpx;
			  line-height: 40rpx;
			  color: #999;
			}
		}
		.content {
			line-height: 1.75;
			font-size: 32rpx;
			margin-top: 40rpx;
			padding: 0 30rpx 80rpx;
			word-break: break-word;
			color: #333;
		}
	}
	.pupview {
		padding-top: 16px;
	}
</style>