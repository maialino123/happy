(function($){
	var defaults = {
		
		//svg图案的路径
		d: "",
		
		//填充颜色
		fill: "none",
		
		//线条颜色
		stroke: "#000",
		
		//线条宽度
		strokeWidth: "1px",
		
		//是否同时改变透明度
		opacity: "false",
		
		//动画持续时间
		time: 4500
		
	}
	
	$.fn.extend({
		sketch: function(opt) {
			var options = $.extend(defaults,opt);
			var SVG;
			return this.each(function() {
				SVG = "<svg width='100%' height='100%' xmlns='http://www.w3.org/2000/svg' version='1.1'>"+
					  "<path class='sketch_path' d='"+options.d+"'/>"+
					  "</svg>"
				$(this).append(SVG);
				var opac = (options.opacity==="false")?1:0;
				$(".sketch_path").css({
					"fill": options.fill,
					"stroke": options.stroke,
					"stroke-width": options.strokeWidth,
					"stroke-dasharray": "1000",
					"stroke-dashoffset": "1000",
					"opacity": opac
				}).animate({
					"stroke-dashoffset": "0",
					"opacity": "1"
				},options.time);
			});
		}
	});
})(jQuery);