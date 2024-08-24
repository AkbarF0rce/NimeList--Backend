import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Anime } from './entities/anime.entity';
import { Genre } from 'src/genre/entities/genre.entity';
import { PhotoAnime } from 'src/photo_anime/entities/photo_anime.entity';
import { CreateAnimeDto } from './dto/create-anime.dto';
import { In } from 'typeorm';
import { join } from 'path';
import { unlink } from 'fs/promises';
import { Review } from 'src/reviews/reviews.entity';

@Injectable()
export class AnimeService {
  constructor(
    @InjectRepository(Anime)
    private animeRepository: Repository<Anime>,
    @InjectRepository(Genre)
    private genreRepository: Repository<Genre>,
    @InjectRepository(PhotoAnime)
    private photoRepository: Repository<PhotoAnime>,
    @InjectRepository(Review)
    private reviewRepository: Repository<Review>,
  ) {}

  async create(
    createAnimeDto: CreateAnimeDto,
    files: Express.Multer.File[],
    photo_cover: Express.Multer.File,
  ) {
    const { title, synopsis, release_date, genres, trailer_link } =
      createAnimeDto;

    // Fetch genre objects from the database
    const genreEntities = await this.genreRepository.find({
      where: {
        id: In(genres),
      },
    });

    const anime = this.animeRepository.create({
      title,
      synopsis,
      release_date,
      trailer_link,
      photo_cover: photo_cover.path,
      genres: genreEntities,
    });

    await this.animeRepository.save(anime);

    // Save photos if available
    if (files && files.length > 0) {
      for (const file of files) {
        const photo = this.photoRepository.create({
          file_path: file.path, // Adjust if using a different storage strategy
          anime,
        });
        await this.photoRepository.save(photo);
      }
    }

    return {
      anime: anime,
    };
  }

  async findAnimeById(id: number) {
    return await this.animeRepository.findOne({ where: { id } });
  }

  async updateAnimeDetails(
    animeId: number,
    updateAnimeDto: CreateAnimeDto, // Data anime yang ingin diupdate
    genreIds: number[], // ID genre baru yang ingin dihubungkan dengan anime ini
    photo_anime: Express.Multer.File[], // File foto baru yang di-upload
    photo_cover: Express.Multer.File, // File cover baru yang di-upload
  ) {
    // Cari anime berdasarkan ID
    const anime = await this.animeRepository.findOne({
      where: { id: animeId },
      relations: ['genres', 'photos'], // Ambil relasi genre dan photo saat ini
    });

    if (!anime) {
      throw new NotFoundException('Anime tidak ditemukan');
    }

    // Identifikasi dan hapus foto cover lama yang tidak ada di file baru
    for (const cover of anime.photo_cover) {
      const Path = join(process.cwd(), cover);
      try {
        await unlink(Path); // Hapus file cover lama dari sistem
      } catch (err) {
        console.error('Error hapus data file foto: ', err);
      }
    }

    // Ubah path cover dengan path yang baru
    anime.photo_cover = photo_cover.path;

    // Update informasi dasar anime
    Object.assign(anime, updateAnimeDto);
    await this.animeRepository.save(anime);

    // Update genre
    const genres = await this.genreRepository.findByIds(genreIds);
    if (genres.length !== genreIds.length) {
      throw new NotFoundException('Beberapa genre tidak ditemukan');
    }
    anime.genres = genres;
    await this.animeRepository.save(anime);

    // Buat set untuk menyimpan path file yang baru diupload
    const newFilePaths = new Set(photo_anime.map((file) => file.path));

    // Identifikasi dan hapus foto lama yang tidak ada di file baru
    for (const photo of anime.photos) {
      const oldFilePath = join(process.cwd(), photo.file_path);
      // Jika file path lama tidak ada di file path yang baru, maka hapus
      if (!newFilePaths.has(photo.file_path)) {
        try {
          await unlink(oldFilePath); // Hapus file lama dari sistem
        } catch (err) {
          console.error('Error deleting old photo file:', err);
        }
        await this.photoRepository.remove(photo); // Hapus data foto lama dari database
      }
    }

    // 6. Simpan path dan file foto baru yang belum ada di database
    const existingFilePaths = anime.photos.map((photo) => photo.file_path);
    const newPhotos = photo_anime
      .filter((file) => !existingFilePaths.includes(file.path)) // Hanya simpan file dan path baru yang belum ada di database
      .map(async (file) => {
        const photo = this.photoRepository.create({
          file_path: file.path,
          anime,
        });
        await this.photoRepository.save(photo);
      });

    return {
      message: 'Anime, genre, dan foto berhasil diperbarui',
      updatedAnime: anime,
      updatedPhotos: [...anime.photos, ...newPhotos],
    };
  }

  async getAnime(animeId: number) {
    // Cari anime berdasarkan id
    const anime = await this.animeRepository.findOne({
      where: { id: animeId },
      relations: ['genres', 'photos'],
    });

    if (!anime) {
      throw new NotFoundException('Anime tidak ditemukan');
    }

    // Hitung total review dari id anime
    const reviewCount = await this.reviewRepository
      .createQueryBuilder('review')
      .where('review.id_anime = :animeId', { animeId })
      .getCount();

    // Hitung average rating dari id anime
    const getAvgRating = await this.reviewRepository
      .createQueryBuilder('review')
      .where('review.id_anime = id_anime', { animeId })
      .select('AVG(review.rating)', 'ratingAvg')
      .getRawOne();

    // Format rata-rata rating dengan dua angka di belakang koma
    const avgRating = parseFloat(getAvgRating.ratingAvg).toFixed(2);

    return {
      anime,
      reviewCount,
      averageRating: parseFloat(avgRating) || 0, // Set 0 jika tidak ada rating
    };
  }
}
