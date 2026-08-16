// schema扩展相关文档请参阅：https://uniapp.dcloud.net.cn/uniCloud/jql-schema-ext.html
// 获取数据库实例
const db = uniCloud.database()

// 文章数据库名称
const articleDBName = 'cms-notes'

module.exports = {   
    trigger: {
        afterRead: async function ({userInfo, clientInfo, result, where, field}) {
			// 获取文章id
			const id = where && where._id
			
			// 如果id不存在或者field不包含content，则返回
			if (id && field.includes('content')) {
			  // 读取了content字段后view_count加1
			  await db.collection(articleDBName).where(where).update({
			    view_count: db.command.inc(1)
			  })
			}
		}
    }
}
