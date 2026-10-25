Component({properties:{row:{type:Object,value:{}},photos:{type:Array,value:[]}},methods:{images(){this.triggerEvent('images',{id:this.data.row.id})}}})
