Component({properties:{src:{type:String,value:''}},methods:{preview(){this.triggerEvent('preview')},failed(){this.triggerEvent('failed')}}})
