
"use client";
import React from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, EffectFade, Pagination, Navigation } from 'swiper/modules';
import Image from 'next/image';

// Importar estilos de Swiper
import 'swiper/css';
import 'swiper/css/effect-fade';
import 'swiper/css/pagination';
import 'swiper/css/navigation';

interface Anuncio {
  id: string;
  urlImagen: string;
  titulo: string;
  descripcion?: string;
}

export default function CarteleraDigital({ anuncios }: { anuncios: Anuncio[] }) {
  if (!anuncios || anuncios.length === 0) {
    return (
      <div className="w-full h-48 bg-muted rounded-xl flex items-center justify-center border-2 border-dashed">
        <p className="text-muted-foreground font-medium">No hay anuncios disponibles en este momento.</p>
      </div>
    );
  }

  return (
    <div className="w-full relative group">
      {/* Marco decorativo del "Televisor" con tamaño ajustado */}
      <div className="relative rounded-xl overflow-hidden shadow-lg border-2 md:border-4 border-card bg-card aspect-[21/9] max-h-[400px]">
        <Swiper
          modules={[Autoplay, EffectFade, Pagination, Navigation]}
          effect="fade"
          loop={true}
          autoplay={{
            delay: 7000,
            disableOnInteraction: false,
          }}
          pagination={{ clickable: true, dynamicBullets: true }}
          navigation={true}
          className="h-full w-full"
        >
          {anuncios.map((anuncio) => (
            <SwiperSlide key={anuncio.id}>
              <div className="relative h-full w-full">
                <Image
                  src={anuncio.urlImagen}
                  alt={anuncio.titulo}
                  layout="fill"
                  objectFit="cover"
                  className="opacity-90"
                />
                
                {/* Banner de información inferior */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent p-4 md:p-6 pt-12">
                  <div className="border-l-4 border-primary pl-4">
                    <h3 className="text-lg md:text-2xl font-black text-white uppercase tracking-tight">
                      {anuncio.titulo}
                    </h3>
                    {anuncio.descripcion && (
                      <p className="text-gray-200 text-xs md:text-sm mt-1 font-light max-w-2xl line-clamp-2">
                        {anuncio.descripcion}
                      </p>
                    )}
                  </div>
                </div>

                {/* Badge de "EN VIVO / ACTUALIDAD" */}
                <div className="absolute top-4 right-4 bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded flex items-center gap-1.5 animate-pulse">
                  <span className="w-2 h-2 bg-white rounded-full"></span>
                  CARTELERA VIRTUAL
                </div>
              </div>
            </SwiperSlide>
          ))}
        </Swiper>
      </div>
    </div>
  );
}
