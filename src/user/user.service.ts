import { Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Repository } from 'typeorm';
import { v4 } from 'uuid';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}
  async create(createUserDto: CreateUserDto) {
    const post = await this.userRepository.create(createUserDto);
    post.salt = v4();
    return await this.userRepository.save(post);
  }

  async countUserPremium() {
    const count = await this.userRepository
      .createQueryBuilder('user')
      .innerJoinAndSelect('user.role', 'role')
      .where('role.name = :roleName', { roleName: 'user' })
      .andWhere('user.status_premium = :premiumStatus', {
        premiumStatus: 'active',
      })
      .getCount();

    return {
      totalUserPremium: count,
    };
  }
}
